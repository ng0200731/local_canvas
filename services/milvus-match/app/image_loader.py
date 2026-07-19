"""Image source loading: data URLs and remote HTTP(S) images."""

from __future__ import annotations

import base64
import ipaddress
import re
from io import BytesIO
from typing import Iterable, Set
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError

from .config import Settings

DATA_URL_RE = re.compile(
    r"^data:image/(png|jpe?g|webp|gif);base64,([a-z0-9+/=\s]+)$",
    re.IGNORECASE,
)


class ImageLoadError(Exception):
    """Raised when an image source cannot be loaded safely."""


def _is_private_hostname(hostname: str) -> bool:
    normalized = hostname.strip("[]").lower()
    if normalized in {"localhost", "::1"} or normalized.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(normalized)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        )
    except ValueError:
        pass
    if re.match(r"^(?:127|10)\.", normalized):
        return True
    if re.match(r"^192\.168\.", normalized):
        return True
    if re.match(r"^172\.(?:1[6-9]|2\d|3[01])\.", normalized):
        return True
    return normalized in {"0.0.0.0", "169.254.169.254"}


def _assert_safe_url(url: str, allow_hosts: Set[str]) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ImageLoadError("Only HTTP(S) image URLs are supported.")
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ImageLoadError("Image URL is missing a hostname.")
    if _is_private_hostname(hostname) and hostname not in allow_hosts:
        raise ImageLoadError("Image URL points to a private network address.")


def _decode_data_url(source: str, max_bytes: int) -> bytes:
    match = DATA_URL_RE.match(source.strip())
    if not match:
        raise ImageLoadError("Image data URL is invalid.")
    try:
        raw = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=False)
    except Exception as exc:  # noqa: BLE001
        raise ImageLoadError("Image data URL could not be decoded.") from exc
    if not raw or len(raw) > max_bytes:
        raise ImageLoadError("An image is empty or exceeds the size limit.")
    return raw


def _fetch_remote_image(source: str, settings: Settings) -> bytes:
    url = source
    redirects = 0
    with httpx.Client(
        timeout=settings.fetch_timeout_seconds,
        follow_redirects=False,
    ) as client:
        while True:
            _assert_safe_url(url, settings.allow_hosts)
            response = client.get(url)
            if response.is_redirect:
                location = response.headers.get("location")
                if not location or redirects >= settings.max_redirects:
                    raise ImageLoadError("Image redirect could not be followed.")
                url = str(httpx.URL(url).join(location))
                redirects += 1
                continue
            if response.status_code >= 400:
                raise ImageLoadError(f"Image request failed with {response.status_code}.")
            content_type = (response.headers.get("content-type") or "").split(";")[0].strip()
            if (
                content_type
                and content_type != "application/octet-stream"
                and not re.match(r"^image/(?:png|jpe?g|webp|gif)$", content_type, re.I)
            ):
                raise ImageLoadError("URL did not return a supported image content type.")
            content_length = response.headers.get("content-length")
            if content_length and content_length.isdigit() and int(content_length) > settings.max_image_bytes:
                raise ImageLoadError("A catalog image exceeds the size limit.")
            data = response.content
            if not data or len(data) > settings.max_image_bytes:
                raise ImageLoadError("A catalog image is empty or exceeds the size limit.")
            return data


def load_image_bytes(source: str, settings: Settings) -> bytes:
    if source.startswith("data:"):
        return _decode_data_url(source, settings.max_image_bytes)
    return _fetch_remote_image(source, settings)


def open_rgb_image(source: str, settings: Settings) -> Image.Image:
    data = load_image_bytes(source, settings)
    try:
        image = Image.open(BytesIO(data))
        image.load()
        return image.convert("RGB")
    except UnidentifiedImageError as exc:
        raise ImageLoadError("Image bytes could not be decoded.") from exc
    except Exception as exc:  # noqa: BLE001
        raise ImageLoadError(f"Image decode failed: {exc}") from exc


def describe_sources(sources: Iterable[str]) -> str:
    """Short log-friendly description that avoids dumping full data URLs."""
    parts = []
    for source in sources:
        if source.startswith("data:"):
            parts.append(f"data-url({len(source)} chars)")
        else:
            parts.append(source[:120])
    return ", ".join(parts)
