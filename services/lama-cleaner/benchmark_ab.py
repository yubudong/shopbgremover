"""Run old ShopBG boundary fill and real LaMa against identical truth/masks."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
import tempfile
import time

import cv2
import numpy as np

from inpaint import LamaEngine
from processing import ProcessingSettings, process_image


ROOT = Path(__file__).resolve().parents[2]
NODE_BRIDGE = ROOT / "scripts" / "run_local_inpaint_raw.mjs"


@dataclass(frozen=True)
class Case:
    name: str
    clean: np.ndarray
    mask: np.ndarray
    corrupted: np.ndarray


def resize_square(path: Path, size: int = 512) -> np.ndarray:
    source = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if source is None:
        raise RuntimeError(f"Could not read benchmark source: {path}")
    height, width = source.shape[:2]
    scale = size / min(width, height)
    resized = cv2.resize(
        source,
        (round(width * scale), round(height * scale)),
        interpolation=cv2.INTER_AREA,
    )
    y0 = (resized.shape[0] - size) // 2
    x0 = (resized.shape[1] - size) // 2
    return resized[y0 : y0 + size, x0 : x0 + size]


def add_watermark(clean: np.ndarray, variant: int) -> Case:
    height, width = clean.shape[:2]
    overlay = clean.copy()
    mask = np.zeros((height, width), dtype=np.uint8)
    if variant == 0:
        cv2.putText(
            mask,
            "SHOPBG",
            (round(width * 0.14), round(height * 0.57)),
            cv2.FONT_HERSHEY_DUPLEX,
            1.35,
            255,
            4,
            cv2.LINE_AA,
        )
        colour, opacity = np.array([245, 245, 245]), 0.78
        name = "photo-semitransparent-text"
    elif variant == 1:
        cv2.rectangle(
            mask,
            (round(width * 0.34), round(height * 0.42)),
            (round(width * 0.67), round(height * 0.55)),
            255,
            -1,
        )
        colour, opacity = np.array([35, 45, 225]), 0.72
        name = "photo-product-edge-banner"
    else:
        cv2.putText(
            mask,
            "SALE",
            (round(width * 0.56), round(height * 0.83)),
            cv2.FONT_HERSHEY_DUPLEX,
            1.5,
            255,
            5,
            cv2.LINE_AA,
        )
        colour, opacity = np.array([25, 210, 250]), 0.82
        name = "photo-shadow-texture-text"
    alpha = (mask.astype(np.float32) / 255.0 * opacity)[:, :, None]
    overlay = np.rint(
        clean.astype(np.float32) * (1.0 - alpha) + colour * alpha
    ).astype(np.uint8)
    binary_mask = (mask > 8).astype(np.uint8)
    return Case(name, clean, binary_mask, overlay)


def synthetic_case(name: str, pattern: str, large: bool = False) -> Case:
    size = 512
    yy, xx = np.indices((size, size))
    if pattern == "grid":
        cells = ((xx // 16 + yy // 16) % 2)[:, :, None]
        clean = np.where(
            cells,
            np.array([220, 205, 185]),
            np.array([35, 55, 75]),
        ).astype(np.uint8)
    elif pattern == "wood":
        wave = 30 * np.sin(xx / 10.0 + 0.7 * np.sin(yy / 31.0))
        clean = np.stack(
            (
                105 + wave + yy / 18,
                145 + wave + yy / 24,
                185 + wave + yy / 30,
            ),
            axis=2,
        ).clip(0, 255).astype(np.uint8)
    elif pattern == "cloth":
        weave = 18 * np.sin(xx / 3.0) + 14 * np.sin(yy / 4.0)
        clean = np.stack(
            (145 + weave, 105 + weave * 0.7, 75 + weave * 0.5),
            axis=2,
        ).clip(0, 255).astype(np.uint8)
    else:
        clean = np.stack(
            (70 + xx / 4, 80 + yy / 4, 190 - xx / 8 + yy / 16),
            axis=2,
        ).clip(0, 255).astype(np.uint8)
    mask = np.zeros((size, size), dtype=np.uint8)
    if large:
        mask[128:384, 128:384] = 1
    else:
        cv2.putText(
            mask,
            "WATERMARK",
            (70, 275),
            cv2.FONT_HERSHEY_DUPLEX,
            1.25,
            1,
            4,
            cv2.LINE_AA,
        )
        mask = (mask > 0).astype(np.uint8)
    corrupted = clean.copy()
    corrupted[mask > 0] = [220, 25, 225]
    return Case(name, clean, mask, corrupted)


def cases() -> list[Case]:
    photo_paths = [
        ROOT / "public" / "photo" / "cosmetic.jpg",
        ROOT / "public" / "photo" / "bread.jpg",
        ROOT / "public" / "photo" / "jeans wear.jpg",
    ]
    return [
        synthetic_case("gradient-text", "gradient"),
        synthetic_case("wood-grain-text", "wood"),
        synthetic_case("cloth-weave-text", "cloth"),
        synthetic_case("grid-text", "grid"),
        synthetic_case("large-grid-selection", "grid", large=True),
        *(add_watermark(resize_square(path), index) for index, path in enumerate(photo_paths)),
    ]


def rgba(image: np.ndarray) -> np.ndarray:
    alpha = np.full((*image.shape[:2], 1), 255, dtype=np.uint8)
    return np.concatenate((image[:, :, ::-1], alpha), axis=2)


def old_inpaint(case: Case, temp_dir: Path) -> tuple[np.ndarray, int]:
    input_path = temp_dir / "input.rgba"
    mask_path = temp_dir / "mask.raw"
    output_path = temp_dir / "output.rgba"
    input_path.write_bytes(rgba(case.corrupted).tobytes())
    mask_path.write_bytes(case.mask.tobytes())
    started = time.monotonic()
    subprocess.run(
        [
            "node",
            str(NODE_BRIDGE),
            str(input_path),
            str(mask_path),
            str(output_path),
            str(case.clean.shape[1]),
            str(case.clean.shape[0]),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    elapsed_ms = round((time.monotonic() - started) * 1000)
    output = np.frombuffer(output_path.read_bytes(), dtype=np.uint8).reshape(
        (*case.clean.shape[:2], 4)
    )
    return output[:, :, :3][:, :, ::-1], elapsed_ms


def metrics(clean: np.ndarray, output: np.ndarray, mask: np.ndarray) -> dict:
    selected = mask > 0
    absolute = np.abs(output.astype(np.int16) - clean.astype(np.int16))
    values = absolute[selected]
    return {
        "masked_mae": round(float(np.mean(values)), 2),
        "masked_p95": int(np.percentile(values, 95)),
    }


def run(output_dir: Path | None) -> dict:
    engine = LamaEngine()
    settings = ProcessingSettings()
    reports = []
    with tempfile.TemporaryDirectory(prefix="shopbg-lama-ab-") as raw_temp:
        temp_dir = Path(raw_temp)
        for index, case in enumerate(cases(), 1):
            old_output, old_ms = old_inpaint(case, temp_dir)
            started = time.monotonic()
            lama_result = process_image(
                case.corrupted,
                case.mask * 255,
                engine,
                settings,
            )
            lama_ms = round((time.monotonic() - started) * 1000)
            old_metrics = metrics(case.clean, old_output, case.mask)
            lama_metrics = metrics(case.clean, lama_result.image, case.mask)
            winner = (
                "lama"
                if lama_metrics["masked_mae"] < old_metrics["masked_mae"]
                else "old"
                if old_metrics["masked_mae"] < lama_metrics["masked_mae"]
                else "tie"
            )
            reports.append(
                {
                    "case": case.name,
                    "old": {**old_metrics, "elapsed_ms": old_ms},
                    "lama": {**lama_metrics, "elapsed_ms": lama_ms},
                    "winner_by_masked_mae": winner,
                }
            )
            if output_dir:
                case_dir = output_dir / f"{index:02d}-{case.name}"
                case_dir.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(case_dir / "clean.png"), case.clean)
                cv2.imwrite(str(case_dir / "corrupted.png"), case.corrupted)
                cv2.imwrite(str(case_dir / "mask.png"), case.mask * 255)
                cv2.imwrite(str(case_dir / "old.png"), old_output)
                cv2.imwrite(str(case_dir / "lama.png"), lama_result.image)

    lama_wins = sum(item["winner_by_masked_mae"] == "lama" for item in reports)
    return {
        "case_count": len(reports),
        "lama_wins": lama_wins,
        "lama_win_rate": round(lama_wins / len(reports), 3),
        "note": "Synthetic overlays on repository images are diagnostic, not the final authorized real-watermark quality gate.",
        "cases": reports,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = run(args.output_dir)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(json.dumps(report, indent=2))
