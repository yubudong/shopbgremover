"""Strict image validation and masked LaMa compositing."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import time

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from inpaint import InpaintEngine


class InputError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ProcessingSettings:
    max_side: int = 2048
    max_pixels: int = 2048 * 2048
    crop_max: int = 512
    mask_dilation: int = 3
    mask_feather: int = 3
    max_mask_ratio: float = 0.85


@dataclass(frozen=True)
class ProcessingResult:
    image: np.ndarray
    width: int
    height: int
    mask_ratio: float
    crop_width: int
    crop_height: int
    model_width: int
    model_height: int
    model_ms: int


ENCODING_CONTENT_TYPES = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "WEBP": "image/webp",
}


def probe_encoded_image(
    data: bytes,
    declared_content_type: str,
    allowed_content_types: set[str],
    settings: ProcessingSettings,
) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(data)) as image:
            width, height = image.size
            detected_content_type = ENCODING_CONTENT_TYPES.get(
                (image.format or "").upper()
            )
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InputError(
            "invalid_image",
            "The uploaded file is not a valid supported image.",
        ) from exc

    if detected_content_type not in allowed_content_types:
        raise InputError(
            "unsupported_encoding",
            "The encoded image format is not supported.",
        )
    if detected_content_type != declared_content_type:
        raise InputError(
            "mime_mismatch",
            "The declared Content-Type does not match the encoded image.",
        )
    if width < 1 or height < 1:
        raise InputError("invalid_image", "The uploaded image has invalid dimensions.")
    if max(width, height) > settings.max_side:
        raise InputError(
            "image_dimensions",
            f"The derived image may not exceed {settings.max_side}px on its longest side.",
        )
    if width * height > settings.max_pixels:
        raise InputError(
            "image_pixels",
            f"The derived image may not exceed {settings.max_pixels} decoded pixels.",
        )
    return width, height


def decode_image(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None or image.size == 0:
        raise InputError("invalid_image", "The uploaded image could not be decoded.")

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif image.ndim != 3 or image.shape[2] not in (3, 4):
        raise InputError("unsupported_channels", "The image must use RGB or RGBA channels.")
    return image


def decode_mask(data: bytes) -> np.ndarray:
    mask = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
    if mask is None or mask.size == 0:
        raise InputError("invalid_mask", "The uploaded mask could not be decoded.")
    return mask


def validate_dimensions(
    image: np.ndarray,
    mask: np.ndarray,
    settings: ProcessingSettings,
) -> None:
    height, width = image.shape[:2]
    if mask.shape[:2] != (height, width):
        raise InputError(
            "mask_dimensions",
            "The mask dimensions must exactly match the image dimensions.",
        )
    if max(width, height) > settings.max_side:
        raise InputError(
            "image_dimensions",
            f"The derived image may not exceed {settings.max_side}px on its longest side.",
        )
    if width * height > settings.max_pixels:
        raise InputError(
            "image_pixels",
            f"The derived image may not exceed {settings.max_pixels} decoded pixels.",
        )


def prepare_masks(
    mask: np.ndarray,
    settings: ProcessingSettings,
) -> tuple[np.ndarray, np.ndarray, float, np.ndarray]:
    binary = (mask > 127).astype(np.uint8) * 255
    active_pixels = int(np.count_nonzero(binary))
    total_pixels = binary.size
    if active_pixels == 0:
        raise InputError("empty_mask", "Mark an area to remove before processing.")

    mask_ratio = active_pixels / total_pixels
    if mask_ratio > settings.max_mask_ratio:
        raise InputError(
            "mask_too_large",
            "The marked area is too large; leave more surrounding image for reconstruction.",
        )

    radius = max(0, settings.mask_dilation)
    if radius:
        size = radius * 2 + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
        expanded = cv2.dilate(binary, kernel, iterations=1)
    else:
        expanded = binary.copy()

    feather = max(0, settings.mask_feather)
    if feather:
        size = feather * 2 + 1
        blend = cv2.GaussianBlur(expanded, (size, size), sigmaX=0)
    else:
        blend = expanded.copy()
    blend[expanded == 0] = 0
    blend[binary > 0] = 255
    return binary, expanded, mask_ratio, blend


def model_ready_bgr(image: np.ndarray) -> np.ndarray:
    if image.shape[2] == 3:
        return image.copy()

    bgr = image[:, :, :3].astype(np.float32)
    alpha = image[:, :, 3:4].astype(np.float32) / 255.0
    return np.rint(bgr * alpha + 255.0 * (1.0 - alpha)).astype(np.uint8)


def crop_bounds(expanded_mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(expanded_mask > 0)
    if not len(xs):
        raise InputError("empty_mask", "Mark an area to remove before processing.")

    height, width = expanded_mask.shape
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    box_width, box_height = x1 - x0 + 1, y1 - y0 + 1
    padding = int(min(256, max(48, 0.5 * max(box_width, box_height))))
    return (
        max(0, x0 - padding),
        max(0, y0 - padding),
        min(width, x1 + padding + 1),
        min(height, y1 + padding + 1),
    )


def process_image(
    image: np.ndarray,
    mask: np.ndarray,
    engine: InpaintEngine,
    settings: ProcessingSettings,
) -> ProcessingResult:
    validate_dimensions(image, mask, settings)
    _, expanded_mask, mask_ratio, blend_mask = prepare_masks(mask, settings)
    x0, y0, x1, y1 = crop_bounds(expanded_mask)

    base_bgr = image[:, :, :3]
    model_bgr = model_ready_bgr(image)
    crop_image = model_bgr[y0:y1, x0:x1]
    crop_mask = expanded_mask[y0:y1, x0:x1]
    crop_height, crop_width = crop_image.shape[:2]

    scale = min(1.0, settings.crop_max / max(crop_width, crop_height))
    if scale < 1.0:
        model_width = max(1, round(crop_width * scale))
        model_height = max(1, round(crop_height * scale))
        model_image = cv2.resize(
            crop_image,
            (model_width, model_height),
            interpolation=cv2.INTER_AREA,
        )
        model_mask = cv2.resize(
            crop_mask,
            (model_width, model_height),
            interpolation=cv2.INTER_NEAREST,
        )
    else:
        model_width, model_height = crop_width, crop_height
        model_image, model_mask = crop_image, crop_mask

    started = time.monotonic()
    generated = engine.inpaint(model_image, model_mask)
    model_ms = round((time.monotonic() - started) * 1000)
    if generated.shape != model_image.shape:
        raise RuntimeError("The LaMa engine returned an unexpected image shape.")
    if scale < 1.0:
        generated = cv2.resize(
            generated,
            (crop_width, crop_height),
            interpolation=cv2.INTER_CUBIC,
        )

    output = image.copy()
    blend = (
        blend_mask[y0:y1, x0:x1].astype(np.float32)[:, :, np.newaxis] / 255.0
    )
    original_crop = base_bgr[y0:y1, x0:x1].astype(np.float32)
    composed = np.rint(
        original_crop * (1.0 - blend) + generated.astype(np.float32) * blend
    ).clip(0, 255).astype(np.uint8)
    output[y0:y1, x0:x1, :3] = composed

    return ProcessingResult(
        image=output,
        width=image.shape[1],
        height=image.shape[0],
        mask_ratio=mask_ratio,
        crop_width=crop_width,
        crop_height=crop_height,
        model_width=model_width,
        model_height=model_height,
        model_ms=model_ms,
    )


def encode_png(image: np.ndarray) -> bytes:
    encoded, buffer = cv2.imencode(
        ".png",
        image,
        [int(cv2.IMWRITE_PNG_COMPRESSION), 3],
    )
    if not encoded:
        raise RuntimeError("The processed image could not be encoded.")
    return buffer.tobytes()
