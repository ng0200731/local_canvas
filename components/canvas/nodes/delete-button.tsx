"use client";

import { X } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCanvasActions } from "../canvas-context";

/** A small × shown at the top-right of a node on hover. Deletes the node. */
export function NodeDeleteButton({ id }: { id: string }) {
  const { deleteNode, getNodeConnectionCount } = useCanvasActions();
  const connectionCount = getNodeConnectionCount(id);
  return (
    <ConfirmDialog
      title="Delete node?"
      description={
        <span className="grid gap-2">
          <span>This removes the node and any connected wires from the canvas.</span>
          <span>
            Connected nodes:{" "}
            <span
              className={
                connectionCount > 0
                  ? "text-destructive block text-7xl leading-none font-black"
                  : "font-medium"
              }
            >
              {connectionCount}
            </span>
          </span>
        </span>
      }
      confirmLabel="Delete node"
      onConfirm={() => deleteNode(id)}
      trigger={
        <button
          type="button"
          aria-label="Delete node"
          title="Delete node"
          onPointerDown={(event) => event.stopPropagation()}
          className="nodrag nopan bg-background/90 text-muted-foreground hover:text-destructive focus-visible:ring-ring absolute top-1 right-1 z-40 flex size-5 items-center justify-center rounded border opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
        >
          <X className="size-3.5" />
        </button>
      }
    />
  );
}
