"""Unit tests for ranking helpers (no torch required)."""

from __future__ import annotations

import numpy as np

from app.ranking import (
    color_histogram,
    fuse_clip_and_color,
    fuse_scores,
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


def test_fuse_keeps_clip_dominant_without_local() -> None:
    better_clip = fuse_clip_and_color(0.80, 0.10)
    worse_clip_better_color = fuse_clip_and_color(0.45, 0.99)
    assert better_clip > worse_clip_better_color


def test_strong_local_outranks_moderate_clip_false_positive() -> None:
    # Typical failure: wrong product gets CLIP ~0.55, true parent only ~0.43.
    wrong = fuse_scores(clip_score=0.55, local_score=0.05, color_score=0.40)
    true_parent = fuse_scores(clip_score=0.43, local_score=0.82, color_score=0.20)
    assert true_parent > wrong
    assert true_parent > 0.55


def test_fuse_and_rank_tiebreak() -> None:
    a = fuse_scores(0.50, 0.10, 0.95)
    b = fuse_scores(0.50, 0.10, 0.10)
    assert a > b
    ranked = rank_catalog(["b", "a"], np.array([b, a]), top_k=2)
    assert ranked[0][0] == "a"
