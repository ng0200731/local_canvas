"""Unit tests for ranking helpers (no torch required)."""

from __future__ import annotations

import numpy as np

from app.ranking import (
    color_histogram,
    fuse_clip_and_color,
    max_pairwise_cosine,
    rank_catalog,
)


def test_max_pairwise_prefers_matching_crop() -> None:
    query = [np.array([[1.0, 0.0]], dtype=np.float32)]
    good = [np.array([[0.0, 1.0]], dtype=np.float32), np.array([[1.0, 0.0]], dtype=np.float32)]
    bad = [np.array([[0.0, 1.0]], dtype=np.float32)]
    assert max_pairwise_cosine(query, good) > max_pairwise_cosine(query, bad)


def test_color_histogram_same_color_is_high() -> None:
    blue = np.zeros((8, 8, 3), dtype=np.uint8)
    blue[:, :, 2] = 220
    other = np.zeros((8, 8, 3), dtype=np.uint8)
    other[:, :, 0] = 220
    h1 = color_histogram(blue)
    h2 = color_histogram(blue)
    h3 = color_histogram(other)
    assert float(np.dot(h1, h2)) > 0.99
    assert float(np.dot(h1, h3)) < float(np.dot(h1, h2))


def test_fuse_and_rank() -> None:
    fused_a = fuse_clip_and_color(0.4, 0.9)
    fused_b = fuse_clip_and_color(0.45, 0.1)
    # Strong color agreement can outrank a slightly higher weak CLIP score.
    assert fused_a > fused_b
    ranked = rank_catalog(["b", "a"], np.array([fused_b, fused_a]), top_k=2)
    assert ranked[0][0] == "a"
