"use client";

import Link from "next/link";
import { ArrowUpRight, FileImage, Trash2 } from "lucide-react";
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
      <div className="flex items-start gap-3">
        <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
          <FileImage className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{canvas.name}</span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {canvas.content.nodes.length} node
            {canvas.content.nodes.length === 1 ? "" : "s"} - Updated {formatDate(canvas.updatedAt)}
          </span>
        </span>
      </div>
      <span className="text-primary mt-auto inline-flex items-center gap-1 text-xs font-medium">
        Open canvas <ArrowUpRight className="size-3.5" />
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
    <div className="group bg-card hover:border-primary/30 relative flex min-h-28 flex-col gap-3 rounded-lg border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(canvas.id)}
          className="focus-visible:ring-ring flex flex-1 flex-col gap-3 rounded-md pr-9 text-left outline-none focus-visible:ring-2"
        >
          <CanvasSummary canvas={canvas} />
        </button>
      ) : (
        <Link
          href={`/projects/${projectId}/canvases/${canvas.id}`}
          className="focus-visible:ring-ring flex flex-1 flex-col gap-3 rounded-md pr-9 outline-none focus-visible:ring-2"
        >
          <CanvasSummary canvas={canvas} />
        </Link>
      )}
      <div className="absolute top-3 right-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Project assets
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Canvases</h2>
        </div>
        <CreateCanvasDialog
          projectId={projectId}
          redirectOnCreate={redirectOnCreate}
          onCreated={(canvas) => onCanvasCreated?.(canvas.id)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          Failed to load canvases: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : canvases && canvases.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canvases.map((c) => (
            <CanvasCard key={c.id} canvas={c} projectId={projectId} onOpen={onOpenCanvas} />
          ))}
        </div>
      ) : (
        <div className="bg-card flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center shadow-sm">
          <div className="bg-secondary text-secondary-foreground flex size-11 items-center justify-center rounded-lg">
            <FileImage className="size-5" />
          </div>
          <p className="font-medium">No canvases yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Create a canvas to start arranging notes, references, colors, and generation nodes.
          </p>
          <CreateCanvasDialog
            projectId={projectId}
            redirectOnCreate={redirectOnCreate}
            onCreated={(canvas) => onCanvasCreated?.(canvas.id)}
          />
        </div>
      )}
    </div>
  );
}
