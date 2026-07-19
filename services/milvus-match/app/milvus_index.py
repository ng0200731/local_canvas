"""Ephemeral vector index for per-request reverse image search.

Backends:
  - milvus: pymilvus MilvusClient (Lite file URI or remote). Prefer Linux/Docker.
  - numpy: pure cosine over L2-normalized vectors (Windows-safe, no Docker image).

Env: MILVUS_MATCH_BACKEND=auto|milvus|numpy  (default auto)
"""

from __future__ import annotations

import logging
import uuid
from typing import List, Optional, Protocol, Sequence, Tuple

import numpy as np

logger = logging.getLogger("milvus_match.index")


class VectorIndexClient(Protocol):
    def search_catalog(
        self,
        query_vector: np.ndarray,
        catalog_ids: Sequence[str],
        catalog_vectors: Sequence[np.ndarray],
        top_k: int,
        vector_dim: int,
    ) -> List[Tuple[str, float]]:
        ...


def _collection_name() -> str:
    return f"match_{uuid.uuid4().hex}"


def rank_by_cosine(
    query_vector: np.ndarray,
    catalog_ids: Sequence[str],
    catalog_vectors: Sequence[np.ndarray],
    top_k: int,
    vector_dim: int,
) -> List[Tuple[str, float]]:
    """Brute-force cosine ranking (Milvus-style collection semantics, no server)."""
    if len(catalog_ids) != len(catalog_vectors):
        raise ValueError("Catalog ids and vectors length mismatch.")
    if not catalog_ids:
        return []

    query = np.asarray(query_vector, dtype=np.float32).reshape(-1)
    if query.shape[0] != vector_dim:
        raise ValueError(f"Query embedding dim {query.shape[0]} != expected {vector_dim}.")

    hits: List[Tuple[str, float]] = []
    for item_id, vector in zip(catalog_ids, catalog_vectors):
        vec = np.asarray(vector, dtype=np.float32).reshape(-1)
        if vec.shape[0] != vector_dim:
            raise ValueError(
                f"Catalog embedding dim {vec.shape[0]} != expected {vector_dim} for {item_id}."
            )
        cosine = float(np.clip(np.dot(query, vec), -1.0, 1.0))
        hits.append((str(item_id), cosine))

    hits.sort(key=lambda pair: (-pair[1], pair[0]))
    limit = max(1, min(top_k, len(hits)))
    return hits[:limit]


class NumpyVectorIndex:
    """In-process vector collection — same insert/search idea as Milvus Lite, no binary."""

    def search_catalog(
        self,
        query_vector: np.ndarray,
        catalog_ids: Sequence[str],
        catalog_vectors: Sequence[np.ndarray],
        top_k: int,
        vector_dim: int,
    ) -> List[Tuple[str, float]]:
        return rank_by_cosine(
            query_vector, catalog_ids, catalog_vectors, top_k, vector_dim
        )


class MilvusLiteVectorIndex:
    def __init__(self, client: object) -> None:
        self._client = client

    def search_catalog(
        self,
        query_vector: np.ndarray,
        catalog_ids: Sequence[str],
        catalog_vectors: Sequence[np.ndarray],
        top_k: int,
        vector_dim: int,
    ) -> List[Tuple[str, float]]:
        from pymilvus import DataType, MilvusClient

        client: MilvusClient = self._client  # type: ignore[assignment]
        if len(catalog_ids) != len(catalog_vectors):
            raise ValueError("Catalog ids and vectors length mismatch.")
        if not catalog_ids:
            return []

        query = np.asarray(query_vector, dtype=np.float32).reshape(-1)
        if query.shape[0] != vector_dim:
            raise ValueError(f"Query embedding dim {query.shape[0]} != expected {vector_dim}.")

        collection = _collection_name()
        try:
            schema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=False)
            schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
            schema.add_field(
                field_name="catalog_item_id", datatype=DataType.VARCHAR, max_length=256
            )
            schema.add_field(
                field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=vector_dim
            )

            index_params = client.prepare_index_params()
            index_params.add_index(
                field_name="vector",
                index_type="AUTOINDEX",
                metric_type="COSINE",
            )

            client.create_collection(
                collection_name=collection,
                schema=schema,
                index_params=index_params,
            )

            rows = []
            for index, (item_id, vector) in enumerate(zip(catalog_ids, catalog_vectors)):
                vec = np.asarray(vector, dtype=np.float32).reshape(-1)
                if vec.shape[0] != vector_dim:
                    raise ValueError(
                        f"Catalog embedding dim {vec.shape[0]} != expected {vector_dim} for {item_id}."
                    )
                rows.append(
                    {
                        "id": index,
                        "catalog_item_id": item_id[:240],
                        "vector": vec.tolist(),
                    }
                )

            client.insert(collection_name=collection, data=rows)
            client.flush(collection_name=collection)

            limit = max(1, min(top_k, len(catalog_ids)))
            raw = client.search(
                collection_name=collection,
                data=[query.tolist()],
                limit=limit,
                output_fields=["catalog_item_id"],
                search_params={"metric_type": "COSINE"},
            )

            hits: List[Tuple[str, float]] = []
            first = raw[0] if raw else []
            for hit in first:
                if isinstance(hit, dict):
                    entity = hit.get("entity") or {}
                    item_id = entity.get("catalog_item_id") or hit.get("catalog_item_id")
                    distance = hit.get("distance", hit.get("score"))
                else:
                    entity = getattr(hit, "entity", None) or {}
                    if hasattr(entity, "get"):
                        item_id = entity.get("catalog_item_id")
                    else:
                        item_id = getattr(entity, "catalog_item_id", None)
                    distance = getattr(hit, "distance", None)
                    if distance is None:
                        distance = getattr(hit, "score", None)

                if item_id is None or distance is None:
                    continue
                cosine = max(-1.0, min(1.0, float(distance)))
                hits.append((str(item_id), cosine))

            hits.sort(key=lambda pair: (-pair[1], pair[0]))
            return hits
        finally:
            try:
                if client.has_collection(collection_name=collection):
                    client.drop_collection(collection_name=collection)
            except Exception:  # noqa: BLE001
                logger.exception("Failed to drop temporary collection %s", collection)


def open_vector_index(
    *,
    backend: str,
    milvus_uri: str,
) -> Tuple[VectorIndexClient, str]:
    """
    Open a vector index backend.

    Returns (client, active_backend_name).
    """
    normalized = (backend or "auto").strip().lower()
    if normalized not in {"auto", "milvus", "numpy"}:
        raise ValueError(f"Unknown MILVUS_MATCH_BACKEND: {backend}")

    if normalized == "numpy":
        logger.info("Vector backend: numpy (in-process cosine)")
        return NumpyVectorIndex(), "numpy"

    if normalized in {"auto", "milvus"}:
        try:
            from pymilvus import MilvusClient

            client = MilvusClient(uri=milvus_uri)
            # Smoke-check Lite/file backends do not explode immediately on Windows.
            _ = client.list_collections()
            logger.info("Vector backend: milvus (%s)", milvus_uri)
            return MilvusLiteVectorIndex(client), "milvus"
        except Exception as exc:  # noqa: BLE001
            if normalized == "milvus":
                raise RuntimeError(
                    f"Milvus backend failed ({exc}). "
                    "On Windows use MILVUS_MATCH_BACKEND=numpy, or run via Docker when registry access works."
                ) from exc
            logger.warning(
                "Milvus backend unavailable (%s); falling back to numpy cosine.",
                exc,
            )
            return NumpyVectorIndex(), "numpy"

    return NumpyVectorIndex(), "numpy"


# Backward-compatible name used by main.py
def search_catalog(
    *,
    client: VectorIndexClient,
    query_vector: np.ndarray,
    catalog_ids: Sequence[str],
    catalog_vectors: Sequence[np.ndarray],
    top_k: int,
    vector_dim: int,
) -> List[Tuple[str, float]]:
    return client.search_catalog(
        query_vector, catalog_ids, catalog_vectors, top_k, vector_dim
    )
