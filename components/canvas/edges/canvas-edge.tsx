"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";

import { useCanvasActions } from "../canvas-context";

/**
 * Bezier wire with a small × at its midpoint to delete the connection.
 * ComfyUI-style: the wire follows the drag, and you can remove it directly.
 */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  const { deleteEdge } = useCanvasActions();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} interactionWidth={18} />
      <EdgeLabelRenderer>
        <button
          type="button"
          aria-label="Delete connection"
          title="Delete connection"
          onClick={(e) => {
            e.stopPropagation();
            deleteEdge(id);
          }}
          className="nodrag nopan bg-background text-muted-foreground hover:text-destructive pointer-events-auto absolute z-20 flex size-5 items-center justify-center rounded-full border shadow-sm transition-colors"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <X className="size-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
