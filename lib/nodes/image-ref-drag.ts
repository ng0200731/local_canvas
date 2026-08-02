/**
 * Inter-node drag payload for image references.
 *
 * The original Generate-node drag used the bare {@link IMAGE_URL_DRAG_MIME_TYPE}
 * carrying only a URL string. The G2 redesign needs the *source node* and its
 * alias too (to badge the thumbnail and feed @mentions), so a richer JSON payload
 * rides along under {@link IMAGE_REF_DRAG_MIME_TYPE}. Decoders read the rich one
 * first and fall back to the plain URL, so existing Generate-node drops keep
 * working unchanged.
 */

export const IMAGE_URL_DRAG_MIME_TYPE = "application/ica-image-url";
export const IMAGE_REF_DRAG_MIME_TYPE = "application/ica-image-ref";

export interface ImageRefDragPayload {
  /** The image URL (always present). */
  url: string;
  /** Id of the canvas node the image was dragged from, if any. */
  sourceNodeId: string | null;
  /** Alias/label for the source node (e.g. an Input node's @alias), if any. */
  alias: string | null;
  /** Human-readable label for the source node. */
  label: string | null;
}

export function isImageRefDrag(dataTransfer: DataTransfer): boolean {
  return (
    dataTransfer.types.includes(IMAGE_REF_DRAG_MIME_TYPE) ||
    dataTransfer.types.includes(IMAGE_URL_DRAG_MIME_TYPE)
  );
}

export function readImageRefDrag(dataTransfer: DataTransfer): ImageRefDragPayload | null {
  const rich = dataTransfer.getData(IMAGE_REF_DRAG_MIME_TYPE);
  if (rich) {
    try {
      const parsed = JSON.parse(rich) as Partial<ImageRefDragPayload>;
      if (typeof parsed.url === "string" && parsed.url) {
        return {
          url: parsed.url,
          sourceNodeId: typeof parsed.sourceNodeId === "string" ? parsed.sourceNodeId : null,
          alias: typeof parsed.alias === "string" && parsed.alias ? parsed.alias : null,
          label: typeof parsed.label === "string" && parsed.label ? parsed.label : null,
        };
      }
    } catch {
      // fall through to the plain-URL decoder
    }
  }
  const url = dataTransfer.getData(IMAGE_URL_DRAG_MIME_TYPE);
  if (!url) return null;
  return { url, sourceNodeId: null, alias: null, label: null };
}

export function writeImageRefDrag(
  dataTransfer: DataTransfer,
  payload: ImageRefDragPayload,
): void {
  // Keep the legacy URL-only mime so older drop targets still work.
  dataTransfer.setData(IMAGE_URL_DRAG_MIME_TYPE, payload.url);
  dataTransfer.setData(IMAGE_REF_DRAG_MIME_TYPE, JSON.stringify(payload));
  if (dataTransfer.effectAllowed === "uninitialized") {
    dataTransfer.effectAllowed = "link";
  }
}
