import "server-only";

import sharp from "sharp";

export interface MaskBbox {
  /** Bbox coordinate space (the mask PNG's native size). */
  sourceWidth: number;
  sourceHeight: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Compute the bounding box of the transparent (alpha < 128) region of a mask.
 * Returns null if the mask has no transparent region.
 *
 * Mask convention (same as OpenAI images.edit):
 *   alpha = 0   → pixel is in the edit region
 *   alpha = 255 → pixel is preserved
 */
export async function maskBbox(
  maskBuffer: Buffer,
  width: number,
  height: number,
): Promise<MaskBbox | null> {
  const maskAlpha = await sharp(maskBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .extractChannel(3)
    .toFormat(sharp.format.raw)
    .toBuffer();

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = maskAlpha[y * width + x];
      if (a < 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    sourceWidth: width,
    sourceHeight: height,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Composite the model's output onto the original base, preserving the base
 * outside the mask's bounding box and taking the model's pixels inside the
 * bbox (with a soft feather at the boundary).
 *
 * Unlike `compositeMaskedEdit` (pixel-mask-scoped), this lets the model
 * refine the edit shape inside the bbox — the mask is treated as semantic
 * guidance for the model, not as a pixel-exact selection.
 */
export async function compositeOutsideBbox(
  baseBuffer: Buffer,
  editedBuffer: Buffer,
  bbox: MaskBbox,
  feather = 4,
): Promise<Buffer> {
  const baseMeta = await sharp(baseBuffer).metadata();
  const width = baseMeta.width ?? 0;
  const height = baseMeta.height ?? 0;
  if (!width || !height) throw new Error("compositeOutsideBbox: base has no dimensions.");

  const bboxScaled: MaskBbox = {
    sourceWidth: width,
    sourceHeight: height,
    minX: Math.round((bbox.minX * width) / bbox.sourceWidth),
    minY: Math.round((bbox.minY * height) / bbox.sourceHeight),
    maxX: Math.round((bbox.maxX * width) / bbox.sourceWidth),
    maxY: Math.round((bbox.maxY * height) / bbox.sourceHeight),
    width: 0,
    height: 0,
  };
  bboxScaled.width = bboxScaled.maxX - bboxScaled.minX + 1;
  bboxScaled.height = bboxScaled.maxY - bboxScaled.minY + 1;

  // Resize model output to match base dims.
  const editedResized = await sharp(editedBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const baseRaw = await sharp(baseBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Build a weight map: 1.0 inside bbox (minus feather), 0.0 outside bbox
  // (plus feather), linear ramp across the feather band.
  const channels = 4;
  const out = Buffer.from(baseRaw);
  const featherClamped = Math.max(0, Math.min(feather, Math.floor(Math.min(bboxScaled.width, bboxScaled.height) / 4)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Distance to bbox edge (positive = inside).
      const distInside = Math.min(
        x - bboxScaled.minX,
        bboxScaled.maxX - x,
        y - bboxScaled.minY,
        bboxScaled.maxY - y,
      );
      let weight: number;
      if (distInside < 0) {
        weight = 0;
      } else if (distInside >= featherClamped) {
        weight = 1;
      } else if (featherClamped === 0) {
        weight = 1;
      } else {
        weight = distInside / featherClamped;
      }
      if (weight === 0) continue;
      const idx = (y * width + x) * channels;
      for (let c = 0; c < channels - 1; c += 1) {
        out[idx + c] = Math.round(
          weight * editedResized[idx + c] + (1 - weight) * baseRaw[idx + c],
        );
      }
      // Alpha: keep base alpha.
      out[idx + 3] = baseRaw[idx + 3];
    }
  }

  return sharp(out, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();
}

export async function compositeMaskedEdit(
  baseBuffer: Buffer,
  editedBuffer: Buffer,
  maskBuffer: Buffer,
): Promise<Buffer> {
  const baseMeta = await sharp(baseBuffer).metadata();

  const width = baseMeta.width ?? 0;
  const height = baseMeta.height ?? 0;
  if (!width || !height) throw new Error("Composite: base image has no dimensions.");

  // The provider may return a different size than requested (e.g. 1024x1024
  // regardless of `size`). Resize the edited image to match the base dims.
  const editedResized = await sharp(editedBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const maskAlpha = await sharp(maskBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .extractChannel(3)
    .toFormat(sharp.format.raw)
    .toBuffer();

  const takeFromEdited = Buffer.alloc(maskAlpha.length);
  for (let i = 0; i < maskAlpha.length; i += 1) {
    takeFromEdited[i] = maskAlpha[i] < 128 ? 255 : 0;
  }

  const baseRaw = await sharp(baseBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const out = Buffer.alloc(baseRaw.length);
  const channels = 4;
  for (let i = 0; i < takeFromEdited.length; i += 1) {
    const take = takeFromEdited[i] === 255;
    for (let c = 0; c < channels; c += 1) {
      const idx = i * channels + c;
      out[idx] = take ? editedResized[idx] : baseRaw[idx];
    }
  }

  return sharp(out, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();
}
