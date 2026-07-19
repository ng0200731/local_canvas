"""Cosine similarity ranking helpers with optional color / local fusion."""

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
    """Build an L2-normalized RGB histogram from an HxWx3 uint8 array."""
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        raise ValueError("Expected HxWx3 RGB array.")
    hist = np.zeros(bins * 3, dtype=np.float64)
    flat = rgb.reshape(-1, 3).astype(np.float64)
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


def fuse_scores(
    clip_score: float,
    local_score: float,
    color_score: float = 0.0,
    *,
    clip_weight: float = 0.35,
    local_weight: float = 0.60,
    color_weight: float = 0.05,
) -> float:
    """
    Fuse CLIP, local-feature, and light color scores.

    Local (template/ORB) is weighted highest for crop-from-parent workflows.
    When local evidence is strong, it fully dominates moderate CLIP false positives.
    """
    clip_s = float(np.clip(clip_score, -1.0, 1.0))
    local_s = float(np.clip(local_score, -1.0, 1.0))
    color_s = float(np.clip(color_score, -1.0, 1.0))

    weight_sum = clip_weight + local_weight + color_weight
    if weight_sum <= 0:
        return clip_s

    blended = (
        clip_weight * clip_s + local_weight * local_s + color_weight * color_s
    ) / weight_sum

    # Strong local geometry/template match wins outright.
    if local_s >= 0.72:
        return float(np.clip(max(blended, local_s, clip_s), -1.0, 1.0))
    # Moderate local still can lift true parents above ~0.55 CLIP impostors.
    if local_s >= 0.55:
        return float(np.clip(max(blended, 0.55 * local_s + 0.45 * clip_s), -1.0, 1.0))
    return float(np.clip(max(blended, clip_s * 0.98), -1.0, 1.0))


def fuse_clip_and_color(
    clip_score: float,
    color_score: float,
    *,
    clip_weight: float = 0.90,
    color_weight: float = 0.10,
) -> float:
    return fuse_scores(
        clip_score,
        local_score=0.0,
        color_score=color_score,
        clip_weight=clip_weight,
        local_weight=0.0,
        color_weight=color_weight,
    )


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
    ranked.sort(key=lambda item: (-item[1], item[0]))
    return ranked
