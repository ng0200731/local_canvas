"""Local matching for crop-from-parent: multi-scale template (+ ORB if OpenCV)."""

from __future__ import annotations

import logging
from typing import Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger("picture_sherlock.local_match")

try:
    import cv2  # type: ignore

    CV2_AVAILABLE = True
except Exception:  # noqa: BLE001
    cv2 = None  # type: ignore
    CV2_AVAILABLE = False
    logger.warning(
        "opencv-python-headless is not installed; using numpy template matching only. "
        "Install for faster/stronger matching: pip install opencv-python-headless"
    )


def _pil_to_gray_f32(image: Image.Image, max_side: int) -> np.ndarray:
    rgb = image.convert("RGB")
    width, height = rgb.size
    longest = max(width, height)
    if longest > max_side:
        scale = max_side / float(longest)
        new_size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
        rgb = rgb.resize(new_size, Image.Resampling.BILINEAR)
    arr = np.asarray(rgb, dtype=np.float32)
    gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    return gray


def _ncc_max(catalog: np.ndarray, template: np.ndarray) -> float:
    """Max normalized cross-correlation of template inside catalog (valid region)."""
    ch, cw = catalog.shape
    th, tw = template.shape
    if th >= ch or tw >= cw or th < 8 or tw < 8:
        return 0.0

    # Zero-mean unit template.
    t = template - float(template.mean())
    t_norm = float(np.sqrt((t * t).sum()))
    if t_norm < 1e-6:
        return 0.0
    t = t / t_norm

    best = -1.0
    # Stride for speed on large images.
    stride_y = 1 if ch * cw < 250_000 else 2
    stride_x = 1 if ch * cw < 250_000 else 2
    for y in range(0, ch - th + 1, stride_y):
        for x in range(0, cw - tw + 1, stride_x):
            window = catalog[y : y + th, x : x + tw]
            w = window - float(window.mean())
            w_norm = float(np.sqrt((w * w).sum()))
            if w_norm < 1e-6:
                continue
            score = float((w * t).sum() / w_norm)
            if score > best:
                best = score
    return max(0.0, best)


def _template_match_numpy(
    query: Image.Image,
    catalog: Image.Image,
    scales: Tuple[float, ...],
) -> float:
    query_gray = _pil_to_gray_f32(query, max_side=220)
    catalog_gray = _pil_to_gray_f32(catalog, max_side=420)
    qh, qw = query_gray.shape
    ch, cw = catalog_gray.shape
    best = 0.0
    for scale in scales:
        tw = max(10, int(round(qw * scale)))
        th = max(10, int(round(qh * scale)))
        if tw >= cw or th >= ch:
            fit = min((cw - 1) / max(tw, 1), (ch - 1) / max(th, 1))
            if fit <= 0.2:
                continue
            tw = max(10, int(round(tw * fit * 0.96)))
            th = max(10, int(round(th * fit * 0.96)))
            if tw >= cw or th >= ch:
                continue
        # Resize via PIL for quality.
        q_img = Image.fromarray(query_gray.astype(np.uint8), mode="L").resize(
            (tw, th), Image.Resampling.BILINEAR
        )
        template = np.asarray(q_img, dtype=np.float32)
        score = _ncc_max(catalog_gray, template)
        if score > best:
            best = score
    return float(np.clip(best, 0.0, 1.0))


def template_match_score(
    query: Image.Image,
    catalog: Image.Image,
    *,
    scales: Tuple[float, ...] = (0.45, 0.6, 0.8, 1.0, 1.25, 1.5),
) -> float:
    """
    Multi-scale template match of query inside catalog. Returns [0, 1].
    Uses OpenCV when available; otherwise a slower numpy NCC fallback.
    """
    if CV2_AVAILABLE:
        query_gray = _pil_to_gray_f32(query, max_side=640).astype(np.uint8)
        catalog_gray = _pil_to_gray_f32(catalog, max_side=1100).astype(np.uint8)
        qh, qw = query_gray.shape[:2]
        ch, cw = catalog_gray.shape[:2]
        if qh < 12 or qw < 12 or ch < 12 or cw < 12:
            return 0.0
        best = 0.0
        for scale in scales:
            tw = max(12, int(round(qw * scale)))
            th = max(12, int(round(qh * scale)))
            if tw >= cw or th >= ch:
                fit = min((cw - 1) / max(tw, 1), (ch - 1) / max(th, 1))
                if fit <= 0.15:
                    continue
                tw = max(12, int(round(tw * fit * 0.98)))
                th = max(12, int(round(th * fit * 0.98)))
                if tw >= cw or th >= ch:
                    continue
            try:
                template = cv2.resize(query_gray, (tw, th), interpolation=cv2.INTER_AREA)
                result = cv2.matchTemplate(catalog_gray, template, cv2.TM_CCOEFF_NORMED)
                _min_v, max_v, _min_loc, _max_loc = cv2.minMaxLoc(result)
                if np.isfinite(max_v):
                    best = max(best, float(max_v))
            except Exception:  # noqa: BLE001
                continue
        raw = float(np.clip(best, 0.0, 1.0))
    else:
        raw = _template_match_numpy(query, catalog, scales)

    if raw < 0.35:
        return raw * 0.5
    if raw >= 0.70:
        return float(np.clip(0.78 + (raw - 0.70) * 0.85, 0.0, 1.0))
    return float(0.20 + (raw - 0.35) * (0.58 / 0.35))


def orb_match_score(
    query: Image.Image,
    catalog: Image.Image,
    *,
    max_features: int = 1500,
    ratio: float = 0.78,
    min_matches: int = 10,
    min_inliers: int = 7,
) -> float:
    if not CV2_AVAILABLE:
        return 0.0

    query_gray = _pil_to_gray_f32(query, max_side=900).astype(np.uint8)
    catalog_gray = _pil_to_gray_f32(catalog, max_side=900).astype(np.uint8)

    orb = cv2.ORB_create(nfeatures=max_features, scaleFactor=1.2, nlevels=8)
    kp_q, des_q = orb.detectAndCompute(query_gray, None)
    kp_c, des_c = orb.detectAndCompute(catalog_gray, None)
    if des_q is None or des_c is None or len(kp_q) < 8 or len(kp_c) < 8:
        return 0.0

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    try:
        knn = matcher.knnMatch(des_q, des_c, k=2)
    except Exception:  # noqa: BLE001
        return 0.0

    good = []
    for pair in knn:
        if len(pair) != 2:
            continue
        m, n = pair
        if m.distance < ratio * n.distance:
            good.append(m)
    if len(good) < min_matches:
        return float(min(0.30, len(good) / 45.0))

    src = np.float32([kp_q[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_c[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    if matrix is None or mask is None:
        return float(min(0.35, len(good) / 55.0))

    inliers = int(mask.ravel().sum())
    if inliers < min_inliers:
        return float(min(0.40, inliers / 28.0))
    inlier_ratio = inliers / max(1, len(good))
    magnitude = min(1.0, inliers / 24.0)
    return float(np.clip(0.55 * magnitude + 0.45 * inlier_ratio, 0.0, 1.0))


def map_local_score_to_cosine_like(local_score: float) -> float:
    local = float(np.clip(local_score, 0.0, 1.0))
    return float(np.clip(0.20 + 0.79 * (local ** 0.70), 0.0, 0.99))


def best_local_score(
    query: Image.Image,
    catalog: Image.Image,
) -> Tuple[float, float]:
    """Return (raw_local_score, cosine_like_score)."""
    template = template_match_score(query, catalog)
    orb = orb_match_score(query, catalog)
    raw = max(template, 0.85 * orb + 0.15 * template)
    return raw, map_local_score_to_cosine_like(raw)
