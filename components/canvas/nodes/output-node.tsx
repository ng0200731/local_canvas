"use client";

import { type NodeProps } from "@xyflow/react";
import { Download, ImageIcon, Link2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { OutputCanvasNode } from "@/lib/nodes/types";
import { useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 264;
const DEFAULT_HEIGHT = 220;

export function OutputNode({ id, data, parentId, selected }: NodeProps<OutputCanvasNode>) {
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  const resultUrl = data.resultUrl;

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl}
              alt={data.prompt ?? "Generated output"}
              draggable={false}
              className="h-full min-h-0 w-full min-w-0 object-contain"
            />
            <button
              type="button"
              draggable
              title="Drag as a reference image"
              aria-label="Drag output as a reference image"
              className="nodrag bg-background/85 focus-visible:ring-ring absolute top-2 right-2 flex size-7 cursor-grab items-center justify-center rounded-md border shadow-sm backdrop-blur-sm outline-none focus-visible:ring-2 active:cursor-grabbing"
              onDragStart={(event) => {
                event.dataTransfer.setData("application/ica-image-url", resultUrl);
                event.dataTransfer.effectAllowed = "link";
              }}
            >
              <Link2 className="size-3.5" />
            </button>
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
