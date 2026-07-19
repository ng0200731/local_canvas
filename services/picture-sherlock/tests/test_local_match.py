"""Local match helper tests (requires opencv)."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.local_match import best_local_score, template_match_score


def _patch_image(size: int = 240) -> Image.Image:
    img = Image.new("RGB", (size, size), (20, 20, 20))
    draw = ImageDraw.Draw(img)
    # Rose-ish blob + leaf so texture is non-uniform.
    draw.ellipse((70, 60, 170, 160), fill=(220, 150, 150))
    draw.ellipse((90, 80, 150, 140), fill=(200, 120, 130))
    draw.polygon([(40, 130), (90, 100), (70, 180)], fill=(30, 80, 160))
    draw.rectangle((20, 20, 220, 40), fill=(240, 240, 240))
    return img


def test_template_prefers_true_parent_over_unrelated() -> None:
    parent = _patch_image(280)
    crop = parent.crop((60, 50, 190, 180))
    impostor = Image.new("RGB", (280, 120), (240, 240, 240))
    draw = ImageDraw.Draw(impostor)
    # Fake "FILA-like" block letters
    draw.rectangle((20, 30, 70, 90), fill=(30, 30, 30))
    draw.rectangle((90, 30, 120, 90), fill=(30, 30, 30))
    draw.rectangle((140, 30, 220, 90), fill=(30, 30, 30))

    parent_score = template_match_score(crop, parent)
    impostor_score = template_match_score(crop, impostor)
    assert parent_score > 0.55
    assert parent_score > impostor_score + 0.25

    _raw_p, mapped_p = best_local_score(crop, parent)
    _raw_i, mapped_i = best_local_score(crop, impostor)
    assert mapped_p > mapped_i
    assert mapped_p > 0.70
