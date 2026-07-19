"""Pydantic request/response schemas for the match API."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


MAX_CATALOG_ITEMS = 100
MAX_SOURCE_LENGTH = 8_000_000


def _is_supported_image_source(value: str) -> bool:
    lowered = value.strip()
    if lowered.startswith("data:image/"):
        return True
    return lowered.startswith("http://") or lowered.startswith("https://")


class QueryImage(BaseModel):
    url: str = Field(min_length=1, max_length=MAX_SOURCE_LENGTH)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if not _is_supported_image_source(value):
            raise ValueError("Image must be an HTTP(S) URL or a supported image data URL.")
        return value


class CatalogImage(BaseModel):
    catalogItemId: str = Field(min_length=1, max_length=240)
    imageUrl: str = Field(min_length=1, max_length=MAX_SOURCE_LENGTH)

    @field_validator("imageUrl")
    @classmethod
    def validate_image_url(cls, value: str) -> str:
        if not _is_supported_image_source(value):
            raise ValueError("Image must be an HTTP(S) URL or a supported image data URL.")
        return value


class MatchRequest(BaseModel):
    queryImage: QueryImage
    catalog: List[CatalogImage] = Field(min_length=1, max_length=MAX_CATALOG_ITEMS)
    topK: Optional[int] = Field(default=None, ge=1, le=MAX_CATALOG_ITEMS)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "MatchRequest":
        ids = [item.catalogItemId for item in self.catalog]
        if len(ids) != len(set(ids)):
            raise ValueError("catalogItemId values must be unique.")
        if self.topK is None:
            self.topK = len(self.catalog)
        else:
            self.topK = min(self.topK, len(self.catalog))
        return self


class MatchHit(BaseModel):
    catalogItemId: str
    cosine: float


class MatchResponse(BaseModel):
    matches: List[MatchHit]
    searchedCount: int
    model: str


class HealthResponse(BaseModel):
    status: str
    model: str
    device: str


class ErrorResponse(BaseModel):
    error: str
