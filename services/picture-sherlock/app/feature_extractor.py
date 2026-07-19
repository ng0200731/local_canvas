"""CLIP vision feature extraction with multi-view crops (Picture Sherlock style)."""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


def build_image_views(image: Image.Image) -> List[Tuple[str, Image.Image]]:
    """
    Full frame + center crops. Helps when packaging/background dominates the frame
    (e.g. product in a bag on a table) while the query is a close-up fabric fill.
    """
    width, height = image.size
    views: List[Tuple[str, Image.Image]] = [("full", image)]

    def crop_ratio(label: str, ratio: float) -> None:
        crop_w = max(1, int(round(width * ratio)))
        crop_h = max(1, int(round(height * ratio)))
        left = max(0, (width - crop_w) // 2)
        top = max(0, (height - crop_h) // 2)
        views.append((label, image.crop((left, top, left + crop_w, top + crop_h))))

    crop_ratio("center-70", 0.70)
    crop_ratio("center-50", 0.50)
    return views


class FeatureExtractor:
    """Load CLIP vision tower once and extract L2-normalized embeddings."""

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
        # Picture Sherlock uses the vision tower only.
        self.model = CLIPModel.from_pretrained(model_id).vision_model
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
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        outputs = self.model(**inputs)

        if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
            features = outputs.pooler_output.detach().cpu().numpy()
        elif hasattr(outputs, "last_hidden_state"):
            features = outputs.last_hidden_state.mean(dim=1).detach().cpu().numpy()
        else:
            features = np.asarray(outputs[0].mean(dim=1).detach().cpu().numpy())

        return self._normalize(features)

    def extract_views(self, image: Image.Image) -> List[np.ndarray]:
        """Embed multi-view crops; returns one L2-normalized vector per view."""
        vectors: List[np.ndarray] = []
        for _label, view in build_image_views(image):
            vectors.append(self.extract(view))
        return vectors
