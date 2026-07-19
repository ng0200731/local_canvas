"""FastAPI entrypoint for CLIP + vector reverse-image match (Milvus Lite or numpy)."""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image

from .config import Settings, get_settings
from .feature_extractor import FeatureExtractor
from .image_loader import ImageLoadError, describe_sources, open_rgb_image
from .milvus_index import VectorIndexClient, open_vector_index, search_catalog
from .schemas import (
    ErrorResponse,
    HealthResponse,
    MatchHit,
    MatchRequest,
    MatchResponse,
)

logger = logging.getLogger("milvus_match")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_extractor: Optional[FeatureExtractor] = None
_index: Optional[VectorIndexClient] = None
_active_backend: str = "unloaded"
_settings: Settings = get_settings()


def _ensure_milvus_parent(uri: str) -> None:
    if uri.startswith("http://") or uri.startswith("https://"):
        return
    path = Path(uri)
    if path.suffix:
        path.parent.mkdir(parents=True, exist_ok=True)
    else:
        path.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _extractor, _index, _active_backend, _settings
    _settings = get_settings()
    logger.info(
        "Loading CLIP model %s on device=%s; backend=%s uri=%s",
        _settings.model_id,
        _settings.device or "auto",
        _settings.backend,
        _settings.milvus_uri,
    )
    _extractor = FeatureExtractor(model_id=_settings.model_id, device=_settings.device)
    if _extractor.vector_dim:
        _settings.vector_dim = int(_extractor.vector_dim)

    if _settings.backend in {"auto", "milvus"}:
        _ensure_milvus_parent(_settings.milvus_uri)

    _index, _active_backend = open_vector_index(
        backend=_settings.backend,
        milvus_uri=_settings.milvus_uri,
    )
    logger.info(
        "Model ready on %s (dim=%s); vector backend=%s",
        _extractor.device,
        _settings.vector_dim,
        _active_backend,
    )
    yield
    _extractor = None
    _index = None
    _active_backend = "unloaded"


app = FastAPI(
    title="Milvus Match Sidecar",
    version="1.1.0",
    lifespan=lifespan,
)


@app.exception_handler(ImageLoadError)
async def image_load_error_handler(_request: Request, exc: ImageLoadError):
    return JSONResponse(status_code=400, content=ErrorResponse(error=str(exc)).model_dump())


@app.exception_handler(ValueError)
async def value_error_handler(_request: Request, exc: ValueError):
    return JSONResponse(status_code=400, content=ErrorResponse(error=str(exc)).model_dump())


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    device = _extractor.device if _extractor is not None else "unloaded"
    backend_tag = _active_backend if _active_backend != "unloaded" else _settings.backend
    return HealthResponse(
        status="ok",
        model=f"{_settings.model_name}+{backend_tag}",
        device=device,
    )


def _load_image(source: str) -> Image.Image:
    return open_rgb_image(source, _settings)


def _embed_catalog_item(item_id: str, source: str) -> Tuple[str, np.ndarray]:
    if _extractor is None:
        raise RuntimeError("Feature extractor is not loaded.")
    image = _load_image(source)
    vector = _extractor.extract_best_view(image)
    return item_id, vector


def _embed_many(sources: Sequence[Tuple[str, str]]) -> List[Tuple[str, np.ndarray]]:
    results: List[Optional[Tuple[str, np.ndarray]]] = [None] * len(sources)
    workers = max(1, min(_settings.embed_workers, len(sources)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_map = {
            pool.submit(_embed_catalog_item, item_id, source): (index, item_id)
            for index, (item_id, source) in enumerate(sources)
        }
        for future in as_completed(future_map):
            index, item_id = future_map[future]
            try:
                results[index] = future.result()
            except ImageLoadError:
                raise
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"Failed to embed catalog item {item_id}: {exc}") from exc
    return [item for item in results if item is not None]


@app.post(
    "/v1/match",
    response_model=MatchResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def match_images(payload: MatchRequest) -> MatchResponse:
    if _extractor is None or _index is None:
        raise RuntimeError("Milvus match service is not loaded.")

    logger.info(
        "match request catalog=%s query=%s backend=%s",
        len(payload.catalog),
        describe_sources([payload.queryImage.url]),
        _active_backend,
    )

    try:
        query_image = _load_image(payload.queryImage.url)
        query_vector = _extractor.extract_best_view(query_image)
        catalog_vectors = _embed_many(
            [(item.catalogItemId, item.imageUrl) for item in payload.catalog]
        )
        ranked = search_catalog(
            client=_index,
            query_vector=query_vector,
            catalog_ids=[item_id for item_id, _ in catalog_vectors],
            catalog_vectors=[vector for _, vector in catalog_vectors],
            top_k=payload.topK or len(catalog_vectors),
            vector_dim=_settings.vector_dim,
        )
    except ImageLoadError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("match failed")
        raise RuntimeError(str(exc)) from exc

    if not ranked:
        raise RuntimeError("No matches could be produced.")

    logger.info(
        "match complete top=%s score=%.3f catalog=%s backend=%s",
        ranked[0][0],
        ranked[0][1],
        len(payload.catalog),
        _active_backend,
    )

    # Keep response model id stable for the Next.js schema; backend is in /health.
    return MatchResponse(
        matches=[MatchHit(catalogItemId=item_id, cosine=score) for item_id, score in ranked],
        searchedCount=len(payload.catalog),
        model=_settings.model_name,
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_request: Request, exc: RuntimeError):
    return JSONResponse(status_code=500, content=ErrorResponse(error=str(exc)).model_dump())


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=os.getenv("MILVUS_MATCH_RELOAD", "").lower() in {"1", "true", "yes"},
    )


if __name__ == "__main__":
    main()
