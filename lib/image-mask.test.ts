import { describe, expect, it } from "vitest";

import {
  clampMaskBrushThickness,
  excludeSelectedPixels,
  selectSimilarColorPixels,
  shouldCloseFreehandLoop,
} from "@/lib/image-mask";

function pixels(colors: readonly (readonly [number, number, number])[]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap(([red, green, blue]) => [red, green, blue, 255]));
}

describe("image masks", () => {
  it("clamps brush thickness to the supported range", () => {
    expect(clampMaskBrushThickness(-10)).toBe(4);
    expect(clampMaskBrushThickness(80)).toBe(80);
    expect(clampMaskBrushThickness(999)).toBe(160);
  });

  it("closes a freehand loop only when its last point is near its first", () => {
    expect(
      shouldCloseFreehandLoop(
        [
          { x: 0.1, y: 0.1 },
          { x: 0.8, y: 0.2 },
          { x: 0.11, y: 0.12 },
        ],
        0.03,
      ),
    ).toBe(true);
    expect(
      shouldCloseFreehandLoop(
        [
          { x: 0.1, y: 0.1 },
          { x: 0.8, y: 0.2 },
          { x: 0.6, y: 0.7 },
        ],
        0.03,
      ),
    ).toBe(false);
  });

  it("selects similar colors globally, including disconnected pixels", () => {
    const selected = selectSimilarColorPixels({
      pixels: pixels([
        [255, 0, 0],
        [0, 0, 255],
        [250, 5, 5],
      ]),
      width: 3,
      height: 1,
      seedX: 0,
      seedY: 0,
      tolerance: 5,
      scope: "global",
    });
    expect([...selected]).toEqual([255, 0, 255]);
  });

  it("keeps region selection within the connected matching area", () => {
    const selected = selectSimilarColorPixels({
      pixels: pixels([
        [255, 0, 0],
        [0, 0, 255],
        [255, 0, 0],
      ]),
      width: 3,
      height: 1,
      seedX: 0,
      seedY: 0,
      tolerance: 0,
      scope: "region",
    });
    expect([...selected]).toEqual([255, 0, 0]);
  });

  it("removes excluded pixels from a selection", () => {
    const selected = new Uint8ClampedArray([255, 255, 0, 255]);
    const excluded = new Uint8ClampedArray([0, 255, 255, 0]);

    expect([...excludeSelectedPixels(selected, [excluded])]).toEqual([255, 0, 0, 255]);
  });
});
