"use client";

import { useContext, useState, type CSSProperties } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";

import { ConnectionHighlightContext } from "../canvas-context";

/**
 * Connection dots. Both are `type="source"` so that, under
 * `connectionMode="loose"`, React Flow never forces a dot into the target role
 * — whichever dot you grab is the connection source and whichever dot you drop
 * on is the target (line leaves the grabbed dot, lands on the dropped dot).
 * They differ only by position (left/right) and a distinct id.
 */
const BASE_STYLE = {
  width: 12,
  height: 12,
  border: "2px solid var(--color-card, #ffffff)",
  // Keep dots above node content (e.g. an image-node's <img>, which is
  // positioned and would otherwise paint over them). The highlight patch
  // raises this further when a dot is active.
  zIndex: 10,
} as const;

/** Enlarge + glow ring in `color`. Applied to a dot whenever it is highlighted. */
function highlightPatch(color: string): CSSProperties {
  return {
    width: 16,
    height: 16,
    boxShadow: `0 0 0 3px ${color}, 0 0 10px ${color}`,
    zIndex: 20,
  };
}

/**
 * Highlight patch + hover handlers for a single dot. A dot lights up when:
 *  - its node is the connection source (both dots, in the wire color), or
 *  - it's the specific dot under the pointer on the hovered target (wire color), or
 *  - the cursor is simply resting on it while no drag is in progress (its own color).
 *
 * Drag-time highlights take precedence over the idle hover highlight. Each port
 * reads its own node id via `useNodeId`, so no id has to be threaded in.
 */
function usePortHighlight(position: "left" | "right", ownColor: string) {
  const nodeId = useNodeId();
  const { sourceId, targetId, targetDot, color } = useContext(ConnectionHighlightContext);
  const [hovered, setHovered] = useState(false);

  let patch: CSSProperties | null = null;
  if (nodeId && nodeId === sourceId) {
    patch = highlightPatch(color); // source node: both dots, wire color
  } else if (nodeId && nodeId === targetId && targetDot === position) {
    patch = highlightPatch(color); // hovered target dot, wire color
  } else if (hovered && sourceId === null) {
    patch = highlightPatch(ownColor); // idle hover, the dot's own color
  }

  return {
    style: patch ?? {},
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  };
}

export function InputPort({
  color,
  top = "2%",
  zIndex,
}: {
  color: string;
  top?: CSSProperties["top"];
  zIndex?: number;
}) {
  const { style: highlight, hoverProps } = usePortHighlight("left", color);
  return (
    <Handle
      id="left"
      type="source"
      position={Position.Left}
      {...hoverProps}
      style={{
        ...BASE_STYLE,
        top,
        ...(zIndex === undefined ? {} : { zIndex }),
        transform: "translate(0, 0)",
        background: color,
        ...highlight,
      }}
    />
  );
}

export function OutputPort({ color }: { color: string }) {
  const { style: highlight, hoverProps } = usePortHighlight("right", color);
  return (
    <Handle
      id="right"
      type="source"
      position={Position.Right}
      {...hoverProps}
      style={{
        ...BASE_STYLE,
        top: "98%",
        transform: "translate(-100%, -100%)",
        background: color,
        ...highlight,
      }}
    />
  );
}
