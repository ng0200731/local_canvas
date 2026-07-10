"use client";

import { createContext, useContext, type CSSProperties } from "react";
import { useReactFlow } from "@xyflow/react";

import { DEFAULT_EDGE_COLOR } from "@/lib/nodes/ports";

export interface ConnectedImageReference {
  edgeId: string;
  nodeId: string;
  kind: "image";
  alias: string;
  label: string;
  imageUrl: string;
}

export interface ConnectedPantoneReference {
  edgeId: string;
  nodeId: string;
  kind: "pantone";
  alias: string;
  label: string;
  swatchHex: string;
}

export type ConnectedInputReference = ConnectedImageReference | ConnectedPantoneReference;

export interface CanvasActions {
  /** Patch a node's data object (shallow merge). */
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** Return image inputs connected to a node, used as named generation references. */
  getConnectedInputReferences: (nodeId: string) => ConnectedInputReference[];
  /** True when a Generate node is connected to an Output node. */
  hasConnectedOutputNode: (generateNodeId: string) => boolean;
  /** Patch the Output node connected to a Generate node. Returns false when no Output is wired. */
  updateConnectedOutputData: (generateNodeId: string, patch: Record<string, unknown>) => boolean;
  /** Store a generated image URL on the connected Output node and record it in image history. */
  writeGeneratedImageToOutput: (
    generateNodeId: string,
    url: string,
    meta: { prompt: string; model: string },
  ) => boolean;
  /** Remove a node and any wires connected to it. */
  deleteNode: (id: string) => void;
  /** Remove a single wire (edge) between nodes. */
  deleteEdge: (id: string) => void;
  /** Resize a node (px). Keeps the top-left corner fixed under nodeOrigin [0.5,0.5]. */
  resizeNode: (id: string, width: number, height: number) => void;
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions {
  const ctx = useContext(CanvasActionsContext);
  if (!ctx) {
    throw new Error("useCanvasActions must be used within CanvasActionsContext");
  }
  return ctx;
}

/**
 * Returns the accent color of this node's parent group (if any), so a grouped
 * node can paint an outline matching its group. Reads the live store; the node
 * re-renders when its own `parentId` changes (attach/detach).
 */
export function useGroupAccent(parentId?: string | null): string | null {
  const { getNode } = useReactFlow();
  if (!parentId) return null;
  const parent = getNode(parentId);
  return (parent?.data?.color as string | undefined) ?? null;
}

/**
 * Live connection-in-progress state. The source node (where the drag started)
 * and the node currently under the cursor (the drop target) are both
 * highlighted so the user can see where a wire is coming from and where it will
 * land. Kept in its own context (separate from {@link CanvasActionsContext}) so
 * action-only consumers don't re-render while a drag is in flight.
 */
export interface ConnectionHighlight {
  sourceId: string | null;
  targetId: string | null;
  /** Which dot on the hovered target node the pointer is over ("left" | "right" | null). */
  targetDot: "left" | "right" | null;
  /** Color shared by the in-progress wire and all highlight rings — the source node's type color. */
  color: string;
}

export const ConnectionHighlightContext = createContext<ConnectionHighlight>({
  sourceId: null,
  targetId: null,
  targetDot: null,
  color: DEFAULT_EDGE_COLOR,
});

/** ~50% alpha, appended to a 6-digit hex color to soften the ring's outer glow. */
const RING_GLOW_ALPHA = "80";

/**
 * Returns a box-shadow ring style when `id` is the connection source or the
 * hovered target, otherwise `undefined`. Uses box-shadow (not border) so the
 * node's layout never shifts while it is highlighted.
 */
export function useConnectionHighlight(id: string): CSSProperties | undefined {
  const { sourceId, targetId, color } = useContext(ConnectionHighlightContext);
  if (id !== sourceId && id !== targetId) return undefined;
  return {
    boxShadow: `0 0 0 2px ${color}, 0 0 16px ${color}${RING_GLOW_ALPHA}`,
  };
}
