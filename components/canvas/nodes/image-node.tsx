"use client";

import { useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { ImageIcon, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { ImageCanvasNode } from "@/lib/nodes/types";
import { uploadImage } from "@/lib/upload";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 224;
const DEFAULT_HEIGHT = 160;

export function ImageNode({ id, data, parentId }: NodeProps<ImageCanvasNode>) {
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
      className="group bg-card relative flex flex-col overflow-hidden rounded-md border shadow-sm"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.url}
              alt={data.alt ?? ""}
              draggable={false}
              className="min-h-0 min-w-0 h-full w-full cursor-pointer object-contain"
              onClick={() => inputRef.current?.click()}
            />
            {/* Reference drag handle: drag onto a Generate node's reference slot.
                `nodrag` tells React Flow not to move the node from this element. */}
            <button
              type="button"
              draggable
              title="Drag onto a Generate node to use as a reference image"
              className="nodrag bg-background/80 absolute top-1 right-1 flex size-6 cursor-grab items-center justify-center rounded backdrop-blur-sm active:cursor-grabbing"
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
            className="text-muted-foreground hover:text-foreground flex flex-col items-center gap-1"
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
