"""Cosine similarity ranking helpers with optional color fusion."""

from __future__ import annotations

from typing import List, Sequence, Tuple

import numpy as np


def cosine_similarities(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Return cosine similarities for an L2-normalized query vs matrix rows."""
    query_vec = query.reshape(1, -1) if query.ndim == 1 else query
    if query_vec.shape[0] != 1:
        query_vec = query_vec[:1]
    if matrix.ndim == 1:
        matrix = matrix.reshape(1, -1)
    # Features are L2-normalized, so cosine == dot product.
    scores = (matrix @ query_vec.T).reshape(-1)
    return np.clip(scores.astype(np.float64), -1.0, 1.0)


def max_pairwise_cosine(
    query_views: Sequence[np.ndarray],
    catalog_views: Sequence[np.ndarray],
) -> float:
    """Best cosine across every query-view × catalog-view pair."""
    best = -1.0
    for query in query_views:
        q = query.reshape(-1)
        for catalog in catalog_views:
            c = catalog.reshape(-1)
            score = float(np.clip(np.dot(q, c), -1.0, 1.0))
            if score > best:
                best = score
    return best


def color_histogram(rgb: np.ndarray, bins: int = 16) -> np.ndarray:
    """
    Build an L2-normalized RGB histogram from an HxWx3 uint8 array.
    """
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        raise ValueError("Expected HxWx3 RGB array.")
    hist = np.zeros(bins * 3, dtype=np.float64)
    flat = rgb.reshape(-1, 3).astype(np.float64)
    # Scale 0-255 into bin indices.
    scaled = np.clip((flat / 256.0) * bins, 0, bins - 1).astype(np.int32)
    for channel in range(3):
        counts = np.bincount(scaled[:, channel], minlength=bins).astype(np.float64)
        hist[channel * bins : (channel + 1) * bins] = counts
    total = hist.sum()
    if total > 0:
        hist /= total
    norm = np.linalg.norm(hist)
    if norm > 1e-12:
        hist /= norm
    else:
        hist[0] = 1.0
    return hist.astype(np.float32)


def fuse_clip_and_color(
    clip_score: float,
    color_score: float,
    *,
    clip_weight: float = 0.72,
    color_weight: float = 0.28,
) -> float:
    """
    Fuse CLIP cosine and color-hist cosine into a single ranking score in [-1, 1].
    Weights should sum to ~1; defaults emphasize structure/texture over pure color.
    """
    weight_sum = clip_weight + color_weight
    if weight_sum <= 0:
        return float(np.clip(clip_score, -1.0, 1.0))
    fused = (clip_weight * clip_score + color_weight * color_score) / weight_sum
    return float(np.clip(fused, -1.0, 1.0))


def rank_catalog(
    catalog_ids: Sequence[str],
    similarities: np.ndarray,
    top_k: int,
) -> List[Tuple[str, float]]:
    order = np.argsort(-similarities, kind="stable")
    ranked: List[Tuple[str, float]] = []
    for index in order:
        catalog_id = catalog_ids[int(index)]
        score = float(similarities[int(index)])
        ranked.append((catalog_id, score))
        if len(ranked) >= top_k:
            break
    # Deterministic ties: higher score first, then catalog id.
    ranked.sort(key=lambda item: (-item[1], item[0]))
    return ranked
