import { describe, expect, it } from "vitest";

import { unionMaskAlpha, type DecodedMask } from "@/lib/mask-union";

function buildDecodedMask(
  width: number,
  height: number,
  editableIndices: ReadonlyArray<number>,
): DecodedMask {
  const alpha = new Uint8ClampedArray(width * height).fill(255);
  for (const index of editableIndices) alpha[index] = 0;
  return { width, height, alpha };
}

describe("unionMaskAlpha", () => {
  it("returns null for empty input", () => {
    expect(unionMaskAlpha([])).toBeNull();
  });

  it("echoes a single input mask", () => {
    const mask = buildDecodedMask(4, 1, [0, 3]);
    const union = unionMaskAlpha([mask]);
    expect(union).not.toBeNull();
    expect(union!.alpha).toEqual(mask.alpha);
  });

  it("ORs non-overlapping editable areas", () => {
    const a = buildDecodedMask(4, 1, [0]);
    const b = buildDecodedMask(4, 1, [2]);
    const union = unionMaskAlpha([a, b]);
    expect(Array.from(union!.alpha)).toEqual([0, 255, 0, 255]);
  });

  it("ORs overlapping editable areas", () => {
    const a = buildDecodedMask(4, 1, [0, 1]);
    const b = buildDecodedMask(4, 1, [1, 2]);
    const union = unionMaskAlpha([a, b]);
    expect(Array.from(union!.alpha)).toEqual([0, 0, 0, 255]);
  });

  it("returns null on dimension mismatch", () => {
    const a = buildDecodedMask(4, 1, [0]);
    const b = buildDecodedMask(2, 2, [0]);
    expect(unionMaskAlpha([a, b])).toBeNull();
  });

  it("treats preserve-only masks as fully opaque in the union", () => {
    const preserveOnly = buildDecodedMask(4, 1, []);
    const a = buildDecodedMask(4, 1, [1]);
    const union = unionMaskAlpha([a, preserveOnly]);
    expect(Array.from(union!.alpha)).toEqual([255, 0, 255, 255]);
  });
});
