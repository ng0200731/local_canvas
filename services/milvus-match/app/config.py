"""Configuration for the Milvus match FastAPI sidecar."""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path


def _split_hosts(value: str) -> set[str]:
    return {part.strip().lower() for part in value.split(",") if part.strip()}


def _default_milvus_uri() -> str:
    # Docker image sets /data; on Windows host use a local data dir under the service.
    if Path("/data").is_dir() and os.name != "nt":
        return "/data/milvus.db"
    local = Path(__file__).resolve().parent.parent / "data" / "milvus.db"
    return str(local)


def _default_backend() -> str:
    # Windows: default to numpy so host run works without Docker / Milvus Lite.
    if os.name == "nt":
        return "numpy"
    return "auto"


class Settings:
    def __init__(self) -> None:
        self.host = os.getenv("MILVUS_MATCH_HOST", "127.0.0.1" if os.name == "nt" else "0.0.0.0")
        self.port = int(os.getenv("MILVUS_MATCH_PORT", "8092"))
        self.model_id = os.getenv(
            "MILVUS_MATCH_MODEL_ID",
            "openai/clip-vit-base-patch32",
        )
        self.model_name = os.getenv(
            "MILVUS_MATCH_MODEL_NAME",
            "milvus-clip-vit-base-patch32",
        )
        self.device = os.getenv("MILVUS_MATCH_DEVICE")  # None => auto
        self.max_image_bytes = int(
            os.getenv("MILVUS_MATCH_MAX_IMAGE_BYTES", str(12 * 1024 * 1024))
        )
        self.fetch_timeout_seconds = float(
            os.getenv("MILVUS_MATCH_FETCH_TIMEOUT_SECONDS", "15")
        )
        self.max_redirects = int(os.getenv("MILVUS_MATCH_MAX_REDIRECTS", "3"))
        self.embed_workers = int(os.getenv("MILVUS_MATCH_EMBED_WORKERS", "2" if os.name == "nt" else "4"))
        self.allow_hosts = _split_hosts(
            os.getenv(
                "MILVUS_MATCH_ALLOW_HOSTS",
                "localhost,127.0.0.1",
            )
        )
        self.milvus_uri = os.getenv("MILVUS_MATCH_URI", _default_milvus_uri())
        self.vector_dim = int(os.getenv("MILVUS_MATCH_VECTOR_DIM", "512"))
        # auto | milvus | numpy — numpy needs no Docker image / no pymilvus binary.
        self.backend = os.getenv("MILVUS_MATCH_BACKEND", _default_backend()).strip().lower()
        self.platform = f"{sys.platform}/{os.name}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
