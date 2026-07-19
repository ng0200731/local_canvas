"""Configuration for the Picture Sherlock FastAPI sidecar."""

from __future__ import annotations

import os
from functools import lru_cache


def _split_hosts(value: str) -> set[str]:
    return {part.strip().lower() for part in value.split(",") if part.strip()}


class Settings:
    def __init__(self) -> None:
        self.host = os.getenv("PICTURE_SHERLOCK_HOST", "127.0.0.1")
        self.port = int(os.getenv("PICTURE_SHERLOCK_PORT", "8091"))
        self.model_id = os.getenv(
            "PICTURE_SHERLOCK_MODEL_ID",
            "openai/clip-vit-base-patch32",
        )
        self.model_name = os.getenv(
            "PICTURE_SHERLOCK_MODEL_NAME",
            "picture-sherlock-clip-vit-base-patch32",
        )
        self.device = os.getenv("PICTURE_SHERLOCK_DEVICE")  # None => auto
        self.max_image_bytes = int(os.getenv("PICTURE_SHERLOCK_MAX_IMAGE_BYTES", str(12 * 1024 * 1024)))
        self.fetch_timeout_seconds = float(os.getenv("PICTURE_SHERLOCK_FETCH_TIMEOUT_SECONDS", "15"))
        self.max_redirects = int(os.getenv("PICTURE_SHERLOCK_MAX_REDIRECTS", "3"))
        self.embed_workers = int(os.getenv("PICTURE_SHERLOCK_EMBED_WORKERS", "4"))
        self.allow_hosts = _split_hosts(
            os.getenv(
                "PICTURE_SHERLOCK_ALLOW_HOSTS",
                "localhost,127.0.0.1",
            )
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
