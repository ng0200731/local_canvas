"use client";

import Link from "next/link";
import { FileImage, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCanvasDialog } from "@/components/projects/create-canvas-dialog";
import { useCanvases, useDeleteCanvas } from "@/lib/hooks/use-canvases";
import { formatDate } from "@/lib/format";
import type { Canvas } from "@/lib/store";

function CanvasSummary({ canvas }: { canvas: Canvas }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <FileImage className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate font-medium">{canvas.name}</span>
      </div>
      <span className="text-muted-foreground text-xs">
        {canvas.content.nodes.length} node
        {canvas.content.nodes.length === 1 ? "" : "s"} · Updated {formatDate(canvas.updatedAt)}
      </span>
    </>
  );
}

function CanvasCard({
  canvas,
  projectId,
  onOpen,
}: {
  canvas: Canvas;
  projectId: string;
  onOpen?: (canvasId: string) => void;
}) {
  const del = useDeleteCanvas(projectId);

  async function onDelete() {
    await del.mutateAsync(canvas.id);
    toast.success("Canvas deleted");
  }

  return (
    <div className="group hover:bg-muted/40 relative flex flex-col gap-2 rounded-lg border p-4 transition-colors">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(canvas.id)}
          className="flex flex-col gap-2 pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CanvasSummary canvas={canvas} />
        </button>
      ) : (
        <Link
          href={`/projects/${projectId}/canvases/${canvas.id}`}
          className="flex flex-col gap-2 pr-8"
        >
          <CanvasSummary canvas={canvas} />
        </Link>
      )}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <ConfirmDialog
          title="Delete canvas?"
          description="This permanently deletes the canvas."
          onConfirm={onDelete}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Delete canvas">
              <Trash2 />
            </Button>
          }
        />
      </div>
    </div>
  );
}

export function CanvasList({
  projectId,
  redirectOnCreate = true,
  onOpenCanvas,
  onCanvasCreated,
}: {
  projectId: string;
  redirectOnCreate?: boolean;
  onOpenCanvas?: (canvasId: string) => void;
  onCanvasCreated?: (canvasId: string) => void;
}) {
  const { data: canvases, isLoading, isError, error } = useCanvases(projectId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Canvases</h2>
        <CreateCanvasDialog
          projectId={projectId}
          redirectOnCreate={redirectOnCreate}
          onCreated={(canvas) => onCanvasCreated?.(canvas.id)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">
          Failed to load canvases: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : canvases && canvases.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canvases.map((c) => (
            <CanvasCard key={c.id} canvas={c} projectId={projectId} onOpen={onOpenCanvas} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <p className="font-medium">No canvases yet</p>
          <p className="text-muted-foreground text-sm">Create a canvas to start arranging nodes.</p>
        </div>
      )}
    </div>
  );
}
