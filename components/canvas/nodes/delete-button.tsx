"use client";

import { X } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCanvasActions } from "../canvas-context";

/** A small × shown at the top-right of a node on hover. Deletes the node. */
export function NodeDeleteButton({ id }: { id: string }) {
  const { deleteNode } = useCanvasActions();
  return (
    <ConfirmDialog
      title="Delete node?"
      description="This removes the node and any connected wires from the canvas."
      confirmLabel="Delete node"
      onConfirm={() => deleteNode(id)}
      trigger={
        <button
          type="button"
          aria-label="Delete node"
          onClick={(e) => e.stopPropagation()}
          className="bg-background/80 text-muted-foreground hover:text-destructive absolute top-1 right-1 z-10 flex size-5 items-center justify-center rounded opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      }
    />
  );
}
