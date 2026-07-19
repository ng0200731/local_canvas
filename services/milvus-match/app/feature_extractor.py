"""CLIP vision feature extraction (full + light center crops)."""

from __future__ import annotations

from typing import List, Optional, Tuple

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


def build_image_views(image: Image.Image) -> List[Tuple[str, Image.Image]]:
    """Full frame + center crops for a compact multi-view embedding set."""
    width, height = image.size
    views: List[Tuple[str, Image.Image]] = [("full", image)]
    seen: set[Tuple[int, int, int, int]] = {(0, 0, width, height)}

    def add_center(label: str, ratio: float) -> None:
        crop_w = max(1, int(round(width * ratio)))
        crop_h = max(1, int(round(height * ratio)))
        left = max(0, (width - crop_w) // 2)
        top = max(0, (height - crop_h) // 2)
        box = _unique_box(left, top, left + crop_w, top + crop_h, width, height)
        if box in seen:
            return
        if (box[2] - box[0]) < 16 or (box[3] - box[1]) < 16:
            return
        seen.add(box)
        views.append((label, image.crop(box)))

    add_center("center-80", 0.80)
    add_center("center-60", 0.60)
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
        self.processor = CLIPProcessor.from_pretrained(model_id)
        self.model = CLIPModel.from_pretrained(model_id)
        self.model.to(self.device)
        self.model.eval()
        # Projection dim for CLIP ViT-B/32 is typically 512.
        self.vector_dim = int(self.model.config.projection_dim)

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

    def extract_best_view(self, image: Image.Image) -> np.ndarray:
        """Embed multi-view crops and return the primary (full) view embedding.

        Catalog items use the full-frame vector for the Milvus index. Multi-view
        is available if we later switch to max-over-views fusion.
        """
        full = self.extract(image)
        return full.reshape(-1)

    def extract_views(self, image: Image.Image) -> List[np.ndarray]:
        vectors: List[np.ndarray] = []
        for _label, view in build_image_views(image):
            vectors.append(self.extract(view).reshape(-1))
        return vectors
