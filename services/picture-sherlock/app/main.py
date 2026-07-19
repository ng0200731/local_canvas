"""FastAPI entrypoint for Picture Sherlock reverse-image match."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager
from typing import List, Optional, Sequence, Tuple

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image

from .config import Settings, get_settings
from .feature_extractor import FeatureExtractor
from .image_loader import ImageLoadError, describe_sources, open_rgb_image
from .ranking import (
    color_histogram,
    fuse_clip_and_color,
    max_pairwise_cosine,
    rank_catalog,
)
from .schemas import (
    ErrorResponse,
    HealthResponse,
    MatchHit,
    MatchRequest,
    MatchResponse,
)

logger = logging.getLogger("picture_sherlock")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_extractor: Optional[FeatureExtractor] = None
_settings: Settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _extractor, _settings
    _settings = get_settings()
    logger.info(
        "Loading CLIP model %s on device=%s",
        _settings.model_id,
        _settings.device or "auto",
    )
    _extractor = FeatureExtractor(model_id=_settings.model_id, device=_settings.device)
    logger.info("Model ready on %s", _extractor.device)
    yield
    _extractor = None


app = FastAPI(
    title="Picture Sherlock Match Sidecar",
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
    return HealthResponse(status="ok", model=_settings.model_name, device=device)


def _image_features(image: Image.Image) -> Tuple[List[np.ndarray], np.ndarray]:
    if _extractor is None:
        raise RuntimeError("Feature extractor is not loaded.")
    views = _extractor.extract_views(image)
    # Downsample for color hist so packaging noise is averaged a bit.
    thumb = image.copy()
    thumb.thumbnail((128, 128))
    color = color_histogram(np.asarray(thumb.convert("RGB"), dtype=np.uint8))
    return views, color


def _embed_source(source: str) -> Tuple[List[np.ndarray], np.ndarray]:
    image = open_rgb_image(source, _settings)
    return _image_features(image)


def _embed_many(
    sources: Sequence[Tuple[str, str]],
) -> List[Tuple[str, List[np.ndarray], np.ndarray]]:
    """Embed (id, source) pairs; fail the whole batch if any item fails."""
    results: List[Optional[Tuple[str, List[np.ndarray], np.ndarray]]] = [None] * len(sources)
    workers = max(1, min(_settings.embed_workers, len(sources)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_map = {
            pool.submit(_embed_source, source): (index, item_id)
            for index, (item_id, source) in enumerate(sources)
        }
        for future in as_completed(future_map):
            index, item_id = future_map[future]
            try:
                views, color = future.result()
            except ImageLoadError:
                raise
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"Failed to embed catalog item {item_id}: {exc}") from exc
            results[index] = (item_id, views, color)
    return [item for item in results if item is not None]


@app.post(
    "/v1/match",
    response_model=MatchResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def match_images(payload: MatchRequest) -> MatchResponse:
    if _extractor is None:
        raise RuntimeError("Feature extractor is not loaded.")

    logger.info(
        "match request catalog=%s query=%s",
        len(payload.catalog),
        describe_sources([payload.queryImage.url]),
    )

    try:
        query_views, query_color = _embed_source(payload.queryImage.url)
        catalog_vectors = _embed_many(
            [(item.catalogItemId, item.imageUrl) for item in payload.catalog]
        )
    except ImageLoadError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("match failed")
        raise RuntimeError(str(exc)) from exc

    ids: List[str] = []
    fused_scores: List[float] = []
    for item_id, views, color in catalog_vectors:
        clip_score = max_pairwise_cosine(query_views, views)
        color_score = float(np.clip(np.dot(query_color.reshape(-1), color.reshape(-1)), -1.0, 1.0))
        fused = fuse_clip_and_color(clip_score, color_score)
        ids.append(item_id)
        fused_scores.append(fused)

    scores = np.asarray(fused_scores, dtype=np.float64)
    ranked = rank_catalog(ids, scores, top_k=payload.topK or len(ids))

    if not ranked:
        raise RuntimeError("No matches could be produced.")

    logger.info(
        "match complete top=%s score=%.3f catalog=%s",
        ranked[0][0],
        ranked[0][1],
        len(payload.catalog),
    )

    return MatchResponse(
        matches=[MatchHit(catalogItemId=item_id, cosine=score) for item_id, score in ranked],
        searchedCount=len(payload.catalog),
        model=_settings.model_name,
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_request: Request, exc: RuntimeError):
    return JSONResponse(status_code=500, content=ErrorResponse(error=str(exc)).model_dump())
