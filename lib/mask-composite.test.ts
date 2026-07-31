import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { compositeOutsideBbox, maskBbox } from "@/lib/mask-composite";

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
    expect(bbox).toEqual({ minX: 5, minY: 8, maxX: 10, maxY: 17, width: 6, height: 10 });
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
    const bbox = { minX: 5, minY: 5, maxX: 14, maxY: 14, width: 10, height: 10 };
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
    const bbox = { minX: 5, minY: 5, maxX: 14, maxY: 14, width: 10, height: 10 };
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
});
