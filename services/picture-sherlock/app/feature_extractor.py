"""CLIP vision feature extraction with multi-scale tiles for partial-crop match."""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


def _unique_box(
    left: int,
    top: int,
    right: int,
    bottom: int,
    width: int,
    height: int,
) -> Tuple[int, int, int, int]:
    left = max(0, min(left, width - 1))
    top = max(0, min(top, height - 1))
    right = max(left + 1, min(right, width))
    bottom = max(top + 1, min(bottom, height))
    return left, top, right, bottom


def build_image_views(
    image: Image.Image,
    *,
    dense: bool = True,
) -> List[Tuple[str, Image.Image]]:
    """
    Multi-scale views for reverse image search.

    dense=True (catalog): full frame + center crops + grid tiles so a query that is
    only a detail crop (e.g. rose from a patch) can match a region of the full photo.
    dense=False (query): full + a couple center crops only (query is already focused).
    """
    width, height = image.size
    views: List[Tuple[str, Image.Image]] = [("full", image)]
    seen: set[Tuple[int, int, int, int]] = {(0, 0, width, height)}

    def add_box(label: str, left: int, top: int, right: int, bottom: int) -> None:
        box = _unique_box(left, top, right, bottom, width, height)
        if box in seen:
            return
        # Skip tiny crops.
        if (box[2] - box[0]) < 16 or (box[3] - box[1]) < 16:
            return
        seen.add(box)
        views.append((label, image.crop(box)))

    def add_center(label: str, ratio: float) -> None:
        crop_w = max(1, int(round(width * ratio)))
        crop_h = max(1, int(round(height * ratio)))
        left = max(0, (width - crop_w) // 2)
        top = max(0, (height - crop_h) // 2)
        add_box(label, left, top, left + crop_w, top + crop_h)

    add_center("center-80", 0.80)
    add_center("center-60", 0.60)
    if not dense:
        add_center("center-40", 0.40)
        return views

    # Grid tiles at multiple scales — critical for crop-from-product matching.
    for scale, grid in ((0.55, 2), (0.40, 3), (0.30, 3)):
        tile_w = max(1, int(round(width * scale)))
        tile_h = max(1, int(round(height * scale)))
        if grid <= 1:
            add_box(f"tile-{scale}-0-0", 0, 0, tile_w, tile_h)
            continue
        x_step = 0 if width == tile_w else (width - tile_w) / (grid - 1)
        y_step = 0 if height == tile_h else (height - tile_h) / (grid - 1)
        for gy in range(grid):
            for gx in range(grid):
                left = int(round(gx * x_step))
                top = int(round(gy * y_step))
                add_box(
                    f"tile-{int(scale * 100)}-{gx}-{gy}",
                    left,
                    top,
                    left + tile_w,
                    top + tile_h,
                )

    return views


class FeatureExtractor:
    """Load CLIP once and extract L2-normalized image embeddings."""

    def __init__(
        self,
        model_id: str = "openai/clip-vit-base-patch32",
        device: Optional[str] = None,
    ) -> None:
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.model_id = model_id
        # Prefer local HF cache (offline-safe). Fall back to download if needed.
        try:
            self.processor = CLIPProcessor.from_pretrained(model_id, local_files_only=True)
            self.model = CLIPModel.from_pretrained(model_id, local_files_only=True)
        except Exception:
            self.processor = CLIPProcessor.from_pretrained(model_id)
            # Full CLIP model so we use the proper image projection used for retrieval.
            self.model = CLIPModel.from_pretrained(model_id)
        self.model.to(self.device)
        self.model.eval()

    def _normalize(self, features: np.ndarray) -> np.ndarray:
        if features.ndim == 1:
            features = features.reshape(1, -1)
        norm = np.linalg.norm(features, axis=1, keepdims=True)
        normalized = features / (norm + 1e-8)
        return normalized.astype(np.float32)

    @torch.inference_mode()
    def extract(self, image: Image.Image) -> np.ndarray:
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device)
        features = self.model.get_image_features(pixel_values=pixel_values)
        return self._normalize(features.detach().cpu().numpy())

    def extract_views(
        self,
        image: Image.Image,
        *,
        dense: bool = True,
    ) -> List[np.ndarray]:
        """Embed multi-view crops; returns one L2-normalized vector per view."""
        vectors: List[np.ndarray] = []
        for _label, view in build_image_views(image, dense=dense):
            vectors.append(self.extract(view))
        return vectors
