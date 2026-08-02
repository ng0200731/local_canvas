import type { G2Region } from "@/lib/nodes/types";

/**
 * Generate a mask PNG blob from G2 regions.
 * Convention: white (255,255,255) = keep, transparent (alpha=0) = edit.
 * So we fill the whole canvas white, then punch transparent holes for each region.
 *
 * Regions are stored in the main image's NATURAL pixel space, so the mask
 * canvas is sized to the image's natural dimensions (not the node / view size).
 */
function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mimeType));
}

export async function createMaskFromG2Regions(
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  regions: readonly G2Region[],
): Promise<Blob | null> {
  if (!imageNaturalWidth || !imageNaturalHeight) return null;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = imageNaturalWidth;
  maskCanvas.height = imageNaturalHeight;
  const ctx = maskCanvas.getContext("2d");
  if (!ctx) return null;

  // White = keep
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, imageNaturalWidth, imageNaturalHeight);

  // Transparent = edit: punch a hole for every region.
  ctx.globalCompositeOperation = "destination-out";

  for (const region of regions) {
    const thickness = Number.isFinite(region.thickness) && region.thickness > 0
      ? region.thickness
      : 0;

    if (region.type === "rect") {
      const { left, top, width, height } = region.data as {
        left: number;
        top: number;
        width: number;
        height: number;
      };
      if (width > 0 && height > 0) {
        // A rect edits the whole interior (thickness is visual-only in the overlay).
        ctx.fillRect(left, top, width, height);
      }
    } else if (region.type === "freehand") {
      const payload = region.data as {
        points?: { x: number; y: number }[];
        closed?: boolean;
      };
      const points = payload.points ?? [];
      if (points.length < 2) continue;

      ctx.lineWidth = thickness || 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x, points[i]!.y);
      }
      if (payload.closed) {
        ctx.closePath();
        ctx.fill(); // closed loop -> flood the enclosed region
      } else {
        ctx.stroke(); // open stroke -> edit a thick band along the path
      }
    }
  }

  try {
    return await canvasToBlob(maskCanvas, "image/png");
  } catch {
    return null;
  }
}

const REGION_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** Get a color for a new region. Deterministic per index avoids the banned Math.random. */
export function getRegionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length] ?? REGION_COLORS[0]!;
}

/** Back-compat with old call sites; prefers index-based color above. */
export function getRandomRegionColor(): string {
  return REGION_COLORS[0]!;
}
