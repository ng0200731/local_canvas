import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { compositeOutsideBbox, maskBbox, dilateAlpha, alphaMapBbox, alphaMapFromBuffer, compositeAlphaShape } from "@/lib/mask-composite";

/** Build an RGBA PNG buffer of size wxh with a transparent rectangular region. */
async function makeMaskPng(
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
    raw[i * 4 + 0] = 255;
    raw[i * 4 + 1] = 255;
    raw[i * 4 + 2] = 255;
    raw[i * 4 + 3] = inside ? 0 : 255;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Build a solid-color RGBA PNG. */
async function makeSolidPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    raw[i * 4 + 0] = r;
    raw[i * 4 + 1] = g;
    raw[i * 4 + 2] = b;
    raw[i * 4 + 3] = 255;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("maskBbox", () => {
  it("returns the bounding box of the transparent region", async () => {
    const mask = await makeMaskPng(20, 30, { x: 5, y: 8, w: 6, h: 10 });
    const bbox = await maskBbox(mask, 20, 30);
    expect(bbox).toEqual({
      sourceWidth: 20,
      sourceHeight: 30,
      minX: 5,
      minY: 8,
      maxX: 10,
      maxY: 17,
      width: 6,
      height: 10,
    });
  });

  it("returns null when the mask has no transparent region", async () => {
    const raw = Buffer.alloc(10 * 10 * 4);
    for (let i = 0; i < 10 * 10; i += 1) raw[i * 4 + 3] = 255;
    const mask = await sharp(raw, { raw: { width: 10, height: 10, channels: 4 } }).png().toBuffer();
    const bbox = await maskBbox(mask, 10, 10);
    expect(bbox).toBeNull();
  });
});

describe("compositeOutsideBbox", () => {
  it("keeps base pixels outside the bbox and takes edited pixels inside", async () => {
    const base = await makeSolidPng(20, 20, 0, 0, 0); // black
    const edited = await makeSolidPng(20, 20, 255, 255, 255); // white
    const bbox = {
      sourceWidth: 20,
      sourceHeight: 20,
      minX: 5,
      minY: 5,
      maxX: 14,
      maxY: 14,
      width: 10,
      height: 10,
    };
    const out = await compositeOutsideBbox(base, edited, bbox, 0);

    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    // Pixel at (0, 0) — outside bbox, should be base (black).
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
    // Pixel at (10, 10) — inside bbox, should be edited (white).
    const idx = (10 * 20 + 10) * 4;
    expect(data[idx]).toBe(255);
    expect(data[idx + 1]).toBe(255);
    expect(data[idx + 2]).toBe(255);
  });

  it("feathers the boundary when feather > 0", async () => {
    const base = await makeSolidPng(20, 20, 0, 0, 0);
    const edited = await makeSolidPng(20, 20, 255, 255, 255);
    const bbox = {
      sourceWidth: 20,
      sourceHeight: 20,
      minX: 5,
      minY: 5,
      maxX: 14,
      maxY: 14,
      width: 10,
      height: 10,
    };
    const out = await compositeOutsideBbox(base, edited, bbox, 3);
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    // Pixel one step inside the bbox boundary — within feather band, should be partially blended.
    const idx = (6 * 20 + 6) * 4;
    const r = data[idx];
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(255);
    // Pixel at center of bbox — outside feather band, should be fully edited.
    const centerIdx = (10 * 20 + 10) * 4;
    expect(data[centerIdx]).toBe(255);
  });

  it("scales bbox coordinates when base size differs from mask source size", async () => {
    // Base is 40x40 (2x the mask's 20x20 source). Bbox covers (5,5)-(14,14) in
    // mask space → should be (10,10)-(28,28) in base space.
    const base = await makeSolidPng(40, 40, 0, 0, 0);
    const edited = await makeSolidPng(40, 40, 255, 255, 255);
    const bbox = {
      sourceWidth: 20,
      sourceHeight: 20,
      minX: 5,
      minY: 5,
      maxX: 14,
      maxY: 14,
      width: 10,
      height: 10,
    };
    const out = await compositeOutsideBbox(base, edited, bbox, 0);
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    // (5,5) in base space — outside scaled bbox (scaled bbox is 10..28), expect base.
    const outsideIdx = (5 * 40 + 5) * 4;
    expect(data[outsideIdx]).toBe(0);
    // (20,20) in base space — inside scaled bbox, expect edited.
    const insideIdx = (20 * 40 + 20) * 4;
    expect(data[insideIdx]).toBe(255);
  });
});

/**
 * Build an RGBA PNG with a transparent *cross* (plus-sign) editable region,
 * so the shape is clearly NOT a rectangle — its bounding box would cover a
 * large square while the actual transparent area is only two thin strokes.
 */
async function makeCrossMaskPng(
  width: number,
  height: number,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  const arm = 2;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let i = 0; i < width * height; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    const inVertical = x >= cx - arm && x <= cx + arm;
    const inHorizontal = y >= cy - arm && y <= cy + arm;
    const editable = inVertical || inHorizontal;
    raw[i * 4 + 0] = 255;
    raw[i * 4 + 1] = 255;
    raw[i * 4 + 2] = 255;
    raw[i * 4 + 3] = editable ? 0 : 255;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("dilateAlpha", () => {
  it("grows a single editable pixel into a small square", () => {
    const width = 11;
    const height = 11;
    const alpha = Buffer.alloc(width * height).fill(255);
    alpha[5 * width + 5] = 0; // one editable pixel at center
    const out = dilateAlpha(alpha, width, height, 2);
    // Center plus the 2-pixel ring around it should be editable.
    expect(out[5 * width + 5]).toBe(0);
    expect(out[3 * width + 5]).toBe(0); // up 2
    expect(out[7 * width + 5]).toBe(0); // down 2
    expect(out[5 * width + 3]).toBe(0); // left 2
    expect(out[5 * width + 7]).toBe(0); // right 2
    // Corner at distance 3 diagonally stays preserved.
    expect(out[2 * width + 2]).toBe(255);
  });

  it("no-op when radius is 0", () => {
    const alpha = Buffer.alloc(9).fill(255);
    alpha[4] = 0;
    const out = dilateAlpha(alpha, 3, 3, 0);
    expect(out).toBe(alpha);
  });
});

describe("alphaMapBbox + compositeAlphaShape (follow mask shape, not bbox)", () => {
  it("alphaMapBbox reports the cross bbox but composite keeps the cross shape", async () => {
    const width = 30;
    const height = 30;
    const mask = await makeCrossMaskPng(width, height);
    const map = await alphaMapFromBuffer(mask, width, height);

    // The cross's bounding box is the full 30x30 square (arms reach the
    // center of each edge), but the actual editable pixels form a plus sign.
    const bbox = alphaMapBbox(map);
    expect(bbox).not.toBeNull();
    expect(bbox!.width).toBe(width);
    expect(bbox!.height).toBe(height);

    // Composite: black base, white edited, no feather, no dilate. The result
    // should be white ONLY along the cross arms and black in the four bbox
    // corners that a rectangle composite would have wrongly filled.
    const base = await makeSolidPng(width, height, 0, 0, 0);
    const edited = await makeSolidPng(width, height, 255, 255, 255);
    const out = await compositeAlphaShape(base, edited, mask, { feather: 0, dilate: 0 });
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // A corner of the cross bounding box (top-left) is preserved (black) — a
    // bbox rectangle would have made it white.
    const cornerIdx = (1 * width + 1) * 4;
    expect(data[cornerIdx]).toBe(0);
    // Center of the cross is editable (white).
    const centerIdx = (15 * width + 15) * 4;
    expect(data[centerIdx]).toBe(255);
    // A mid-edge pixel on the vertical arm is editable (white).
    const armIdx = (8 * width + 15) * 4;
    expect(data[armIdx]).toBe(255);
  });

  it("dilate grows the cross to cover a band, then composite fills the band", async () => {
    const width = 30;
    const height = 30;
    const mask = await makeCrossMaskPng(width, height);
    const base = await makeSolidPng(width, height, 0, 0, 0);
    const edited = await makeSolidPng(width, height, 255, 255, 255);

    const out = await compositeAlphaShape(base, edited, mask, { feather: 0, dilate: 4 });
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // After a 4px dilation the cross grows into a plus-shaped band. A pixel
    // ~3px off the vertical arm (still inside the bounding square) should now
    // be white, but a far corner must stay black.
    const nearArmIdx = (15 * width + 11) * 4; // 4px left of center, within arm+dilate
    expect(data[nearArmIdx]).toBe(255);
    const farCornerIdx = (2 * width + 2) * 4;
    expect(data[farCornerIdx]).toBe(0);
  });
});

