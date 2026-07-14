import type { ImageMaskColorScope, ImageMaskStrokePoint } from "@/lib/nodes/types";

export const MIN_MASK_BRUSH_THICKNESS = 4;
export const MAX_MASK_BRUSH_THICKNESS = 160;

export function clampMaskBrushThickness(value: number): number {
  if (!Number.isFinite(value)) return MIN_MASK_BRUSH_THICKNESS;
  return Math.min(MAX_MASK_BRUSH_THICKNESS, Math.max(MIN_MASK_BRUSH_THICKNESS, value));
}

export function shouldCloseFreehandLoop(
  points: readonly ImageMaskStrokePoint[],
  threshold: number,
): boolean {
  if (points.length < 3 || threshold <= 0) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return false;
  return Math.hypot(last.x - first.x, last.y - first.y) <= threshold;
}

function colorDistance(
  pixels: Uint8ClampedArray,
  offset: number,
  target: readonly [number, number, number],
): number {
  return Math.hypot(
    pixels[offset] - target[0],
    pixels[offset + 1] - target[1],
    pixels[offset + 2] - target[2],
  );
}

export function selectSimilarColorPixels(input: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerance: number;
  scope: ImageMaskColorScope;
}): Uint8ClampedArray {
  const { pixels, width, height, scope } = input;
  const selected = new Uint8ClampedArray(Math.max(0, width * height));
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return selected;

  const seedX = Math.min(width - 1, Math.max(0, Math.floor(input.seedX)));
  const seedY = Math.min(height - 1, Math.max(0, Math.floor(input.seedY)));
  const seedIndex = seedY * width + seedX;
  const seedOffset = seedIndex * 4;
  if (pixels[seedOffset + 3] === 0) return selected;

  const target = [pixels[seedOffset], pixels[seedOffset + 1], pixels[seedOffset + 2]] as const;
  const threshold = (Math.min(100, Math.max(0, input.tolerance)) / 100) * Math.sqrt(3 * 255 ** 2);
  const matches = (index: number): boolean => {
    const offset = index * 4;
    return pixels[offset + 3] > 0 && colorDistance(pixels, offset, target) <= threshold;
  };

  if (scope === "global") {
    for (let index = 0; index < width * height; index += 1) {
      if (matches(index)) selected[index] = 255;
    }
    return selected;
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail] = seedIndex;
  tail += 1;
  visited[seedIndex] = 1;

  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (!matches(index)) continue;
    selected[index] = 255;

    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor]) continue;
      visited[neighbor] = 1;
      queue[tail] = neighbor;
      tail += 1;
    }
  }

  return selected;
}

export function excludeSelectedPixels(
  selected: Uint8ClampedArray,
  excludedSelections: readonly Uint8ClampedArray[],
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(selected);
  for (const excluded of excludedSelections) {
    const length = Math.min(result.length, excluded.length);
    for (let index = 0; index < length; index += 1) {
      if (excluded[index]) result[index] = 0;
    }
  }
  return result;
}
