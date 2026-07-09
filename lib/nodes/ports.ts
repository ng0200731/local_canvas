import type { NodeType } from "./types";

/**
 * ComfyUI-style color per node type. Shared by the input/output ports and the
 * link wires so a wire matches its source port's color.
 */
export const NODE_PORT_COLORS: Record<NodeType, string> = {
  note: "#f59e0b", // amber
  image: "#10b981", // green
  group: "#94a3b8", // slate
  generate: "#a855f7", // purple
  suppler: "#0ea5e9", // sky
  action: "#f43f5e", // rose
  pantone: "#f97316", // orange
};

/** Fallback color for wires whose source type is unknown. */
export const DEFAULT_EDGE_COLOR = "#6366f1"; // indigo

/** Stroke width for link wires. */
export const EDGE_WIDTH = 2.5;

export function colorForNodeType(type: string | undefined): string {
  if (!type) return DEFAULT_EDGE_COLOR;
  return NODE_PORT_COLORS[type as NodeType] ?? DEFAULT_EDGE_COLOR;
}
