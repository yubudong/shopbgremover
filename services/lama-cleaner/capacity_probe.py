"""Authenticated local load probe for the private LaMa container."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import json
import os
import statistics
import time

import cv2
import httpx
import numpy as np


def signature_for(
    secret: bytes,
    task_id: str,
    timestamp: str,
    image_data: bytes,
    mask_data: bytes,
) -> str:
    canonical = "\n".join(
        (
            "shopbg-inpaint-v1",
            task_id,
            timestamp,
            hashlib.sha256(image_data).hexdigest(),
            hashlib.sha256(mask_data).hexdigest(),
        )
    ).encode("utf-8")
    return hmac.new(secret, canonical, hashlib.sha256).hexdigest()


def build_payload(size: int) -> tuple[bytes, bytes]:
    yy, xx = np.indices((size, size), dtype=np.int32)
    image = np.stack(
        (
            (50 + xx // 10 + 18 * np.sin(yy / 19.0)) % 256,
            (85 + yy // 9 + 22 * np.sin(xx / 23.0)) % 256,
            (170 + (xx + yy) // 14) % 256,
        ),
        axis=2,
    ).astype(np.uint8)
    mask = np.zeros((size, size), dtype=np.uint8)
    mask_width = max(64, size // 4)
    mask_height = max(48, size // 6)
    x0 = (size - mask_width) // 2
    y0 = (size - mask_height) // 2
    mask[y0 : y0 + mask_height, x0 : x0 + mask_width] = 255
    image[mask > 0] = [220, 30, 220]

    image_ok, encoded_image = cv2.imencode(
        ".jpg",
        image,
        [int(cv2.IMWRITE_JPEG_QUALITY), 90],
    )
    mask_ok, encoded_mask = cv2.imencode(
        ".png",
        mask,
        [int(cv2.IMWRITE_PNG_COMPRESSION), 6],
    )
    if not image_ok or not mask_ok:
        raise RuntimeError("Could not encode the capacity probe payload.")
    return encoded_image.tobytes(), encoded_mask.tobytes()


def percentile(values: list[float], ratio: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * ratio))
    return ordered[index]


def run_request(
    index: int,
    base_url: str,
    secret: bytes,
    image_data: bytes,
    mask_data: bytes,
    timeout: float,
) -> dict:
    task_id = f"capacity_{int(time.time())}_{index:04d}"
    timestamp = str(int(time.time()))
    headers = {
        "X-ShopBG-Task-ID": task_id,
        "X-ShopBG-Timestamp": timestamp,
        "X-ShopBG-Signature": signature_for(
            secret,
            task_id,
            timestamp,
            image_data,
            mask_data,
        ),
    }
    started = time.monotonic()
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(
                f"{base_url.rstrip('/')}/v1/inpaint",
                headers=headers,
                files={
                    "image": ("capacity.jpg", image_data, "image/jpeg"),
                    "mask": ("capacity-mask.png", mask_data, "image/png"),
                },
            )
    except httpx.HTTPError as exc:
        return {
            "index": index,
            "status": 0,
            "elapsed_ms": round((time.monotonic() - started) * 1000),
            "model_ms": 0,
            "model_input": None,
            "response_bytes": 0,
            "content_type": None,
            "error": f"{type(exc).__name__}: {exc}",
        }
    elapsed_ms = round((time.monotonic() - started) * 1000)
    return {
        "index": index,
        "status": response.status_code,
        "elapsed_ms": elapsed_ms,
        "model_ms": int(response.headers.get("X-ShopBG-Model-Ms", "0")),
        "model_input": response.headers.get("X-ShopBG-Model-Input"),
        "response_bytes": len(response.content),
        "content_type": response.headers.get("content-type"),
        "error": None if response.status_code == 200 else response.text[:300],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:18080")
    parser.add_argument("--requests", type=int, default=6)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--timeout", type=float, default=180)
    args = parser.parse_args()

    raw_secret = os.getenv("SHOPBG_INPAINT_HMAC_SECRET", "")
    if len(raw_secret.encode("utf-8")) < 32:
        raise SystemExit("SHOPBG_INPAINT_HMAC_SECRET must contain at least 32 bytes.")
    request_count = max(1, min(50, args.requests))
    concurrency = max(1, min(2, args.concurrency))
    image_data, mask_data = build_payload(args.size)
    if len(image_data) > 10 * 1024 * 1024:
        raise SystemExit("The generated image exceeds the 10 MB service input limit.")

    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        results = list(
            pool.map(
                lambda index: run_request(
                    index,
                    args.url,
                    raw_secret.encode("utf-8"),
                    image_data,
                    mask_data,
                    args.timeout,
                ),
                range(request_count),
            )
        )
    total_ms = round((time.monotonic() - started) * 1000)
    successful = [item for item in results if item["status"] == 200]
    elapsed_values = [item["elapsed_ms"] for item in successful]
    report = {
        "requests": request_count,
        "concurrency": concurrency,
        "size": args.size,
        "input_image_bytes": len(image_data),
        "input_mask_bytes": len(mask_data),
        "successful": len(successful),
        "failed": request_count - len(successful),
        "wall_ms": total_ms,
        "throughput_per_minute": (
            round(len(successful) / (total_ms / 60000), 2) if total_ms else 0
        ),
        "latency_ms": (
            {
                "min": min(elapsed_values),
                "median": round(statistics.median(elapsed_values)),
                "p95": percentile(elapsed_values, 0.95),
                "max": max(elapsed_values),
            }
            if elapsed_values
            else None
        ),
        "results": results,
    }
    print(json.dumps(report, indent=2))
    if len(successful) != request_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
