"use client";

import { useReactFlow } from "@xyflow/react";

import { useCanvasActions } from "../canvas-context";

/**
 * Bottom-right resize grip shared by all node types. Drag to resize; the
 * {@link resizeNode} action keeps the top-left corner pinned.
 *
 * Drag deltas are converted to flow space via `screenToFlowPosition`, so the
 * grip tracks the pointer 1:1 at any zoom level. `nodrag`/`nopan` keep React
 * Flow from moving the node or panning the canvas while you drag the grip.
 */
export function ResizeHandle({
  nodeId,
  width,
  height,
  minWidth,
  minHeight,
}: {
  nodeId: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const { resizeNode } = useCanvasActions();

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const startW = width;
    const startH = height;
    const origin = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    const onMove = (ev: PointerEvent) => {
      const cur = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const nextW = Math.max(minWidth, Math.round(startW + (cur.x - origin.x)));
      const nextH = Math.max(minHeight, Math.round(startH + (cur.y - origin.y)));
      resizeNode(nodeId, nextW, nextH);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="nodrag nopan absolute right-0 bottom-0 flex size-4 cursor-nwse-resize items-center justify-center text-muted-foreground/40 hover:text-muted-foreground"
      style={{ touchAction: "none" }}
      aria-label="Resize node"
      role="separator"
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
        <path d="M8 1L1 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M8 5L5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
