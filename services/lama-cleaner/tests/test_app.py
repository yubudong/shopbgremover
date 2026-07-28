from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
import threading
import time

import cv2
import numpy as np
from fastapi.testclient import TestClient


SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from app import ServiceSettings, create_app, signature_for
from processing import ProcessingSettings, prepare_masks


SECRET = b"test-secret-that-is-longer-than-thirty-two-bytes"
TASK_ID = "task_0123456789abcdef"


class SolidEngine:
    name = "test-solid"

    def inpaint(self, image_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
        result = image_bgr.copy()
        result[mask > 127] = [30, 120, 220]
        return result


class TrackingEngine(SolidEngine):
    name = "test-tracking"

    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()

    def inpaint(self, image_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        time.sleep(0.05)
        try:
            return super().inpaint(image_bgr, mask)
        finally:
            with self.lock:
                self.active -= 1


def encode_png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


def encode_jpeg(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def settings(**overrides) -> ServiceSettings:
    values = {
        "hmac_secret": SECRET,
        "max_file_bytes": 10 * 1024 * 1024,
        "max_clock_skew_seconds": 300,
        "max_concurrency": 2,
        "processing": ProcessingSettings(),
    }
    values.update(overrides)
    return ServiceSettings(**values)


def signed_headers(image: bytes, mask: bytes, timestamp: int | None = None) -> dict[str, str]:
    raw_timestamp = str(timestamp if timestamp is not None else int(time.time()))
    return {
        "X-ShopBG-Task-ID": TASK_ID,
        "X-ShopBG-Timestamp": raw_timestamp,
        "X-ShopBG-Signature": signature_for(
            SECRET,
            TASK_ID,
            raw_timestamp,
            image,
            mask,
        ),
    }


def post(client: TestClient, image: bytes, mask: bytes, **kwargs):
    headers = kwargs.pop("headers", signed_headers(image, mask))
    return client.post(
        "/v1/inpaint",
        files={
            "image": ("image.png", image, kwargs.pop("image_type", "image/png")),
            "mask": ("mask.png", mask, kwargs.pop("mask_type", "image/png")),
        },
        headers=headers,
        **kwargs,
    )


def sample_rgba(width: int = 64, height: int = 48) -> tuple[np.ndarray, np.ndarray]:
    image = np.zeros((height, width, 4), dtype=np.uint8)
    image[:, :, :3] = [170, 150, 130]
    image[:, :, 3] = np.arange(width, dtype=np.uint8)[None, :] + 128
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[18:28, 26:38] = 255
    return image, mask


def test_health_reports_independent_engine() -> None:
    app = create_app(settings(), SolidEngine())
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "engine": "test-solid"}


def test_valid_request_preserves_alpha_and_pixels_outside_expanded_mask() -> None:
    source, mask = sample_rgba()
    image_bytes, mask_bytes = encode_png(source), encode_png(mask)
    app = create_app(settings(), SolidEngine())

    with TestClient(app) as client:
        response = post(client, image_bytes, mask_bytes)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-shopbg-engine"] == "test-solid"
    output = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_UNCHANGED)
    assert output.shape == source.shape
    assert np.array_equal(output[:, :, 3], source[:, :, 3])
    _, expanded, _, _ = prepare_masks(mask, ProcessingSettings())
    assert np.array_equal(output[expanded == 0], source[expanded == 0])
    assert np.any(output[mask > 0, :3] != source[mask > 0, :3])


def test_missing_or_invalid_signature_is_rejected() -> None:
    source, mask = sample_rgba()
    image_bytes, mask_bytes = encode_png(source), encode_png(mask)
    app = create_app(settings(), SolidEngine())
    with TestClient(app) as client:
        missing = post(client, image_bytes, mask_bytes, headers={})
        invalid = post(
            client,
            image_bytes,
            mask_bytes,
            headers={
                "X-ShopBG-Task-ID": TASK_ID,
                "X-ShopBG-Timestamp": str(int(time.time())),
                "X-ShopBG-Signature": "0" * 64,
            },
        )
    assert missing.status_code == 422
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "invalid_auth"


def test_expired_signature_is_rejected() -> None:
    source, mask = sample_rgba()
    image_bytes, mask_bytes = encode_png(source), encode_png(mask)
    old_timestamp = int(time.time()) - 301
    app = create_app(settings(), SolidEngine())
    with TestClient(app) as client:
        response = post(
            client,
            image_bytes,
            mask_bytes,
            headers=signed_headers(image_bytes, mask_bytes, old_timestamp),
        )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "expired_auth"


def test_rejects_mismatched_empty_and_near_full_masks() -> None:
    source, mask = sample_rgba()
    image_bytes = encode_png(source)
    masks = {
        "mask_dimensions": encode_png(np.zeros((32, 32), dtype=np.uint8)),
        "empty_mask": encode_png(np.zeros(mask.shape, dtype=np.uint8)),
        "mask_too_large": encode_png(np.full(mask.shape, 255, dtype=np.uint8)),
    }
    app = create_app(settings(), SolidEngine())
    with TestClient(app) as client:
        for expected, mask_bytes in masks.items():
            response = post(client, image_bytes, mask_bytes)
            assert response.status_code == 400
            assert response.json()["error"]["code"] == expected


def test_rejects_invalid_media_decode_and_oversized_dimensions() -> None:
    source, mask = sample_rgba()
    image_bytes, mask_bytes = encode_png(source), encode_png(mask)
    large = np.zeros((16, 65, 3), dtype=np.uint8)
    large_mask = np.zeros((16, 65), dtype=np.uint8)
    large_mask[4:8, 20:30] = 255
    strict = settings(
        processing=ProcessingSettings(max_side=64, max_pixels=64 * 64)
    )
    app = create_app(strict, SolidEngine())
    with TestClient(app) as client:
        unsupported = post(
            client,
            image_bytes,
            mask_bytes,
            image_type="text/plain",
        )
        invalid = post(client, b"not-an-image", mask_bytes)
        too_large = post(client, encode_png(large), encode_png(large_mask))
    assert unsupported.status_code == 415
    assert unsupported.json()["error"]["code"] == "unsupported_image_type"
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "invalid_image"
    assert too_large.status_code == 400
    assert too_large.json()["error"]["code"] == "image_dimensions"


def test_rejects_forged_content_type_before_decoding() -> None:
    source, mask = sample_rgba()
    jpeg_bytes = encode_jpeg(source[:, :, :3])
    mask_bytes = encode_png(mask)
    app = create_app(settings(), SolidEngine())
    with TestClient(app) as client:
        response = post(
            client,
            jpeg_bytes,
            mask_bytes,
            image_type="image/png",
        )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "mime_mismatch"


def test_rejects_body_above_configured_byte_limit() -> None:
    source, mask = sample_rgba()
    image_bytes, mask_bytes = encode_png(source), encode_png(mask)
    app = create_app(settings(max_file_bytes=len(image_bytes) - 1), SolidEngine())
    with TestClient(app) as client:
        response = post(client, image_bytes, mask_bytes)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_global_service_semaphore_caps_concurrent_model_calls() -> None:
    source, mask = sample_rgba()
    image_bytes, mask_bytes = encode_png(source), encode_png(mask)
    engine = TrackingEngine()
    app = create_app(settings(max_concurrency=2), engine)
    with TestClient(app) as client:
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(
                pool.map(
                    lambda _: post(client, image_bytes, mask_bytes),
                    range(4),
                )
            )
    assert all(response.status_code == 200 for response in responses)
    assert engine.max_active == 2


def test_environment_rejects_short_secret(monkeypatch) -> None:
    monkeypatch.setenv("SHOPBG_INPAINT_HMAC_SECRET", "too-short")
    try:
        ServiceSettings.from_env()
    except RuntimeError as exc:
        assert "at least 32" in str(exc)
    else:
        raise AssertionError("a short production secret must fail closed")
