"use client";

import { useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { ImageIcon, Link2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { ImageCanvasNode } from "@/lib/nodes/types";
import { uploadImage } from "@/lib/upload";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 224;
const DEFAULT_HEIGHT = 160;

export function ImageNode({ id, data, parentId, selected }: NodeProps<ImageCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  async function handleFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      updateNodeData(id, { url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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
        "group bg-card relative flex flex-col overflow-hidden rounded-lg border shadow-md",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.image} />
      <div
        className="bg-muted/40 relative flex flex-1 items-center justify-center"
        onDragOver={(e) => {
          if (!data.url) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!data.url) {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }
        }}
      >
        {data.url ? (
          <>
            <ImagePreviewDialog
              src={data.url}
              alt={data.alt ?? ""}
              title="Image node preview"
              trigger={
                <button
                  type="button"
                  className="nodrag nopan focus-visible:ring-ring h-full min-h-0 w-full min-w-0 cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  aria-label="Enlarge image"
                  title="Enlarge image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.url}
                    alt=""
                    draggable={false}
                    className="h-full min-h-0 w-full min-w-0 object-contain"
                  />
                </button>
              }
            />
            <button
              type="button"
              aria-label="Replace image"
              title="Replace image"
              className="nodrag nopan bg-background/85 focus-visible:ring-ring absolute top-2 left-2 flex size-7 items-center justify-center rounded-md border shadow-sm backdrop-blur-sm outline-none focus-visible:ring-2"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" />
            </button>
            {/* Reference drag handle: drag onto a Generate node's reference slot.
                `nodrag` tells React Flow not to move the node from this element. */}
            <button
              type="button"
              draggable
              title="Drag onto a Generate node to use as a reference image"
              className="nodrag bg-background/85 focus-visible:ring-ring absolute top-2 right-2 flex size-7 cursor-grab items-center justify-center rounded-md border shadow-sm backdrop-blur-sm outline-none focus-visible:ring-2 active:cursor-grabbing"
              onDragStart={(e) => {
                e.dataTransfer.setData("application/ica-image-url", data.url!);
                e.dataTransfer.effectAllowed = "link";
              }}
            >
              <Link2 className="size-3.5" />
            </button>
          </>
        ) : uploading ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-24 min-w-28 flex-col items-center justify-center gap-1 rounded-md transition-colors outline-none focus-visible:ring-2"
          >
            <ImageIcon className="size-6" />
            <span className="px-2 text-center text-xs">Click or drop an image</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </div>
      <OutputPort color={NODE_PORT_COLORS.image} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={120} minHeight={120} />
    </div>
  );
}
