# tests/test_numpy_index.py — no torch, no pymilvus
from __future__ import annotations

import numpy as np

from app.milvus_index import NumpyVectorIndex, rank_by_cosine


def test_rank_by_cosine_prefers_matching_vector():
    dim = 8
    query = np.zeros(dim, dtype=np.float32)
    query[0] = 1.0
    near = query.copy()
    far = np.zeros(dim, dtype=np.float32)
    far[1] = 1.0
    hits = rank_by_cosine(
        query,
        ["near", "far"],
        [near, far],
        top_k=2,
        vector_dim=dim,
    )
    assert hits[0][0] == "near"
    assert hits[0][1] > hits[1][1]


def test_numpy_index_api():
    index = NumpyVectorIndex()
    dim = 4
    q = np.array([1, 0, 0, 0], dtype=np.float32)
    a = np.array([0.9, 0.1, 0, 0], dtype=np.float32)
    a = a / np.linalg.norm(a)
    b = np.array([0, 1, 0, 0], dtype=np.float32)
    hits = index.search_catalog(q, ["a", "b"], [a, b], top_k=2, vector_dim=dim)
    assert hits[0][0] == "a"
