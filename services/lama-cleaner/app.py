"""Private, authenticated LaMa service for ShopBG Remover."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
import hashlib
import hmac
import os
import re
import time

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from inpaint import InpaintEngine, build_engine
from processing import (
    InputError,
    ProcessingSettings,
    decode_image,
    decode_mask,
    encode_png,
    probe_encoded_image,
    process_image,
)


ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
ALLOWED_MASK_TYPES = {"image/png"}
TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$")
SIGNATURE_PATTERN = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class ServiceSettings:
    hmac_secret: bytes
    max_file_bytes: int = 10 * 1024 * 1024
    max_clock_skew_seconds: int = 300
    max_concurrency: int = 2
    processing: ProcessingSettings = ProcessingSettings()

    @classmethod
    def from_env(cls) -> "ServiceSettings":
        secret = os.getenv("SHOPBG_INPAINT_HMAC_SECRET", "")
        if len(secret.encode("utf-8")) < 32:
            raise RuntimeError(
                "SHOPBG_INPAINT_HMAC_SECRET must contain at least 32 UTF-8 bytes."
            )
        max_side = int(os.getenv("MAX_SIDE", "2048"))
        return cls(
            hmac_secret=secret.encode("utf-8"),
            max_file_bytes=int(float(os.getenv("MAX_FILE_MB", "10")) * 1024 * 1024),
            max_clock_skew_seconds=int(os.getenv("MAX_CLOCK_SKEW_SECONDS", "300")),
            max_concurrency=int(os.getenv("MAX_CONCURRENCY", "2")),
            processing=ProcessingSettings(
                max_side=max_side,
                max_pixels=int(os.getenv("MAX_DECODED_PIXELS", str(max_side * max_side))),
                crop_max=int(os.getenv("CROP_MAX", "512")),
                mask_dilation=int(os.getenv("MASK_DILATION", "3")),
                mask_feather=int(os.getenv("MASK_FEATHER", "3")),
                max_mask_ratio=float(os.getenv("MAX_MASK_RATIO", "0.85")),
            ),
        )


def content_digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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
            content_digest(image_data),
            content_digest(mask_data),
        )
    ).encode("utf-8")
    return hmac.new(secret, canonical, hashlib.sha256).hexdigest()


async def read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "file_too_large",
                "message": "Each derived image or mask may be at most 10 MB.",
            },
        )
    if not data:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_file", "message": "The uploaded file is empty."},
        )
    return data


def authenticate(
    settings: ServiceSettings,
    task_id: str,
    timestamp: str,
    signature: str,
    image_data: bytes,
    mask_data: bytes,
) -> None:
    if not TASK_ID_PATTERN.fullmatch(task_id):
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_auth", "message": "Invalid service credentials."},
        )
    try:
        parsed_timestamp = int(timestamp)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_auth", "message": "Invalid service credentials."},
        ) from exc
    if abs(int(time.time()) - parsed_timestamp) > settings.max_clock_skew_seconds:
        raise HTTPException(
            status_code=401,
            detail={"code": "expired_auth", "message": "The service signature has expired."},
        )
    normalized_signature = signature.removeprefix("sha256=").lower()
    if not SIGNATURE_PATTERN.fullmatch(normalized_signature):
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_auth", "message": "Invalid service credentials."},
        )
    expected = signature_for(
        settings.hmac_secret,
        task_id,
        timestamp,
        image_data,
        mask_data,
    )
    if not hmac.compare_digest(normalized_signature, expected):
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_auth", "message": "Invalid service credentials."},
        )


def create_app(
    service_settings: ServiceSettings | None = None,
    engine: InpaintEngine | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.settings = service_settings or ServiceSettings.from_env()
        application.state.engine = engine or build_engine()
        application.state.semaphore = asyncio.Semaphore(
            application.state.settings.max_concurrency
        )
        yield

    application = FastAPI(
        title="ShopBG Private LaMa Cleaner",
        version="1.0.0-phase1",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    @application.get("/healthz")
    def health() -> dict:
        current_engine = getattr(application.state, "engine", None)
        return {
            "status": "ok",
            "engine": current_engine.name if current_engine else "starting",
        }

    @application.post("/v1/inpaint")
    async def inpaint(
        image: UploadFile = File(...),
        mask: UploadFile = File(...),
        x_shopbg_task_id: str = Header(..., alias="X-ShopBG-Task-ID"),
        x_shopbg_timestamp: str = Header(..., alias="X-ShopBG-Timestamp"),
        x_shopbg_signature: str = Header(..., alias="X-ShopBG-Signature"),
    ) -> Response:
        settings: ServiceSettings = application.state.settings
        if image.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=415,
                detail={
                    "code": "unsupported_image_type",
                    "message": "The image must be PNG, JPEG, or WebP.",
                },
            )
        if mask.content_type not in ALLOWED_MASK_TYPES:
            raise HTTPException(
                status_code=415,
                detail={
                    "code": "unsupported_mask_type",
                    "message": "The mask must be a PNG image.",
                },
            )

        image_data, mask_data = await asyncio.gather(
            read_limited(image, settings.max_file_bytes),
            read_limited(mask, settings.max_file_bytes),
        )
        authenticate(
            settings,
            x_shopbg_task_id,
            x_shopbg_timestamp,
            x_shopbg_signature,
            image_data,
            mask_data,
        )

        try:
            image_dimensions = probe_encoded_image(
                image_data,
                image.content_type or "",
                ALLOWED_IMAGE_TYPES,
                settings.processing,
            )
            mask_dimensions = probe_encoded_image(
                mask_data,
                mask.content_type or "",
                ALLOWED_MASK_TYPES,
                settings.processing,
            )
            if mask_dimensions != image_dimensions:
                raise InputError(
                    "mask_dimensions",
                    "The mask dimensions must exactly match the image dimensions.",
                )
            decoded_image = decode_image(image_data)
            decoded_mask = decode_mask(mask_data)
            async with application.state.semaphore:
                result = await asyncio.to_thread(
                    process_image,
                    decoded_image,
                    decoded_mask,
                    application.state.engine,
                    settings.processing,
                )
            output = await asyncio.to_thread(encode_png, result.image)
        except InputError as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": exc.code, "message": str(exc)},
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "processing_failed",
                    "message": "The image could not be processed.",
                },
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "processing_failed",
                    "message": "The image could not be processed.",
                },
            ) from exc

        return Response(
            content=output,
            media_type="image/png",
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-ShopBG-Engine": application.state.engine.name,
                "X-ShopBG-Model-Ms": str(result.model_ms),
                "X-ShopBG-Mask-Ratio": f"{result.mask_ratio:.6f}",
                "X-ShopBG-Model-Input": f"{result.model_width}x{result.model_height}",
            },
        )

    @application.exception_handler(HTTPException)
    def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if not isinstance(detail, dict):
            detail = {"code": "invalid_request", "message": str(detail)}
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": detail},
            headers={"Cache-Control": "no-store"},
        )

    return application


app = create_app()
