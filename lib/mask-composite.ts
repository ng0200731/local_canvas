import "server-only";

import sharp from "sharp";

/**
 * Composite the transparent-mask region of `editedBuffer` onto `baseBuffer`,
 * using `maskBuffer`'s alpha channel to decide which pixels come from edited.
 *
 * Mask convention (same as OpenAI images.edit):
 *   - alpha = 0   → pixel is in the edit region → take from `editedBuffer`
 *   - alpha = 255 → pixel is preserved → keep `baseBuffer` pixel
 *
 * All three buffers must be the same pixel dimensions. Result is a PNG Buffer.
 */
export async function compositeMaskedEdit(
  baseBuffer: Buffer,
  editedBuffer: Buffer,
  maskBuffer: Buffer,
): Promise<Buffer> {
  const baseMeta = await sharp(baseBuffer).metadata();
  const maskMeta = await sharp(maskBuffer)
    // Ensure mask is RGBA so we can read its alpha channel
    .ensureAlpha()
    .toColorspace("srgb")
    .metadata();

  const width = baseMeta.width ?? 0;
  const height = baseMeta.height ?? 0;
  if (!width || !height) throw new Error("Composite: base image has no dimensions.");

  // The provider may return a different size than requested (e.g. 1024x1024
  // regardless of `size`). Resize the edited image to match the base dims
  // so we can do a pixel-aligned composite. Use "fill" so the entire edited
  // frame maps onto the base — this does stretch the edit, but pass 1's
  // edit is only inside the mask and pass 2's transfer is also inside the
  // mask, so stretching only matters inside the mask region (it distorts
  // the inpainted texture to match the base's pixel grid).
  const editedResized = await sharp(editedBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Compute mask alpha at base dims. If mask was already base-sized this is
  // a no-op; if it was a different size, it's resized to match.
  const maskAlpha = await sharp(maskBuffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .extractChannel(3)
    .toFormat(sharp.format.raw)
    .toBuffer();

  // Build a normalized mask: 255 where alpha was 0 (edit region), 0 elsewhere.
  // This is the "take from edited" weight.
  const takeFromEdited = Buffer.alloc(maskAlpha.length);
  for (let i = 0; i < maskAlpha.length; i += 1) {
    // Threshold at 128 so feathered edges go to the kept side (preserves
    // soft boundaries of base image rather than blending in model bleed).
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
