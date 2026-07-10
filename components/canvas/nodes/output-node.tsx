"use client";

import { useEffect, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Download, ImageIcon, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Button } from "@/components/ui/button";
import { isStaleGenerationConfigurationError } from "@/lib/generation-errors";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { OutputCanvasNode } from "@/lib/nodes/types";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 264;
const DEFAULT_HEIGHT = 220;

export function OutputNode({ id, data, parentId, selected }: NodeProps<OutputCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const [downloading, setDownloading] = useState(false);
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  const resultUrl = data.resultUrl;

  useEffect(() => {
    if (data.status !== "error" || !isStaleGenerationConfigurationError(data.error)) return;
    updateNodeData(id, { status: "idle", error: undefined });
  }, [data.error, data.status, id, updateNodeData]);

  async function downloadResult() {
    if (!resultUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(resultUrl);
      if (!response.ok) throw new Error("Unable to download this image.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `generated-${data.model ?? "image"}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      const link = document.createElement("a");
      link.href = resultUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      toast.error(
        error instanceof Error
          ? `${error.message} Opened the image in a new tab instead.`
          : "Opened the image in a new tab instead.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      style={{
        width,
        height,
        ...(accent ? { outline: `2px solid ${accent}`, outlineOffset: 2 } : {}),
        ...highlight,
      }}
      className={cn(
        "group bg-card relative flex flex-col gap-2 overflow-hidden rounded-lg border p-3 shadow-md",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.imageOutput} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Download className="size-4" />
        Output
      </div>

      <div className="bg-muted/40 relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border">
        {data.status === "loading" ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : resultUrl ? (
          <>
            <ImagePreviewDialog
              src={resultUrl}
              alt={data.prompt ?? "Generated output"}
              title="Generated output image"
              trigger={
                <button
                  type="button"
                  className="nodrag nopan focus-visible:ring-ring h-full min-h-0 w-full min-w-0 cursor-zoom-in overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  aria-label="Enlarge generated output image"
                  title="Enlarge image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resultUrl}
                    alt=""
                    draggable={false}
                    className="h-full min-h-0 w-full min-w-0 object-contain"
                  />
                </button>
              }
            />
            <button
              type="button"
              draggable
              title="Drag as a reference image"
              aria-label="Drag output as a reference image"
              className="nodrag nopan bg-background/85 focus-visible:ring-ring absolute top-2 right-2 z-10 flex size-7 cursor-grab items-center justify-center rounded-md border shadow-sm backdrop-blur-sm outline-none focus-visible:ring-2 active:cursor-grabbing"
              onDragStart={(event) => {
                event.dataTransfer.setData("application/ica-image-url", resultUrl);
                event.dataTransfer.effectAllowed = "link";
              }}
            >
              <Link2 className="size-3.5" />
            </button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              title="Download generated image"
              aria-label="Download generated image"
              disabled={downloading}
              className="nodrag nopan bg-background/85 absolute top-2 right-11 z-10 shadow-sm backdrop-blur-sm"
              onClick={() => void downloadResult()}
            >
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            </Button>
          </>
        ) : data.status === "error" ? (
          <p className="text-destructive px-3 text-center text-xs">
            {data.error ?? "Generation failed"}
          </p>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 text-xs">
            <ImageIcon className="size-6" />
            <span>Awaiting generation</span>
          </div>
        )}
      </div>

      <ResizeHandle nodeId={id} width={width} height={height} minWidth={176} minHeight={152} />
      <OutputPort color={NODE_PORT_COLORS.imageOutput} />
    </div>
  );
}
