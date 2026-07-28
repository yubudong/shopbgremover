from __future__ import annotations

import os

import numpy as np
import pytest

from inpaint import LamaEngine
from processing import ProcessingSettings, prepare_masks, process_image


@pytest.mark.skipif(
    os.getenv("RUN_LAMA_INTEGRATION") != "1",
    reason="set RUN_LAMA_INTEGRATION=1 when the local big-lama checkpoint is available",
)
def test_real_lama_checkpoint_runs_and_preserves_pixels_outside_blend_region() -> None:
    size = 128
    yy, xx = np.indices((size, size))
    source = np.stack(
        (70 + xx, 90 + yy, 180 - xx // 2 + yy // 4),
        axis=2,
    ).clip(0, 255).astype(np.uint8)
    mask = np.zeros((size, size), dtype=np.uint8)
    mask[50:74, 44:84] = 255
    corrupted = source.copy()
    corrupted[mask > 0] = [220, 25, 220]

    result = process_image(
        corrupted,
        mask,
        LamaEngine(),
        ProcessingSettings(),
    )

    assert result.image.shape == source.shape
    _, expanded, _, _ = prepare_masks(mask, ProcessingSettings())
    assert np.array_equal(result.image[expanded == 0], corrupted[expanded == 0])
    assert np.any(result.image[mask > 0] != corrupted[mask > 0])
