"""LaMa engine adapter for ShopBG Remover's private inpainting service."""

from __future__ import annotations

import os
from typing import Protocol

import cv2
import numpy as np


class InpaintEngine(Protocol):
    name: str

    def inpaint(self, image_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Return an inpainted BGR image with the same dimensions as the input."""


class LamaEngine:
    """CPU LaMa engine backed by simple-lama-inpainting."""

    name = "lama"

    def __init__(self) -> None:
        import torch
        from simple_lama_inpainting import SimpleLama

        os.environ.setdefault("LAMA_DEVICE", "cpu")
        try:
            torch.set_num_threads(max(1, int(os.getenv("TORCH_NUM_THREADS", "4"))))
        except (TypeError, ValueError):
            torch.set_num_threads(4)
        self._lama = SimpleLama()

    def inpaint(self, image_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
        from PIL import Image

        height, width = image_bgr.shape[:2]
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        image_pil = Image.fromarray(image_rgb)
        mask_pil = Image.fromarray(
            (mask > 127).astype(np.uint8) * 255,
            mode="L",
        )
        result = self._lama(image_pil, mask_pil).convert("RGB")
        result_bgr = cv2.cvtColor(np.asarray(result), cv2.COLOR_RGB2BGR)
        return result_bgr[:height, :width]


def build_engine() -> InpaintEngine:
    engine_name = os.getenv("INPAINT_ENGINE", "lama").strip().lower()
    if engine_name != "lama":
        raise ValueError("INPAINT_ENGINE must be 'lama'; production has no fallback engine")
    return LamaEngine()
