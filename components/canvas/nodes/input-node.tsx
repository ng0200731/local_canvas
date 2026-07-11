"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import { type NodeProps } from "@xyflow/react";
import { FolderOpen, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { InputCanvasNode } from "@/lib/nodes/types";
import { uploadImage } from "@/lib/upload";
import {
  useCanvasActions,
  useConnectionHighlight,
  useGroupAccent,
  useReferenceHover,
} from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 248;
const DEFAULT_HEIGHT = 232;

function firstImageFile(items: DataTransferItemList): File | null {
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

export function InputNode({ id, data, parentId, selected }: NodeProps<InputCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const { hoveredReferenceNodeId } = useReferenceHover();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file || !file.type.startsWith("image/")) return;
      setUploading(true);
      try {
        const { url, storagePath } = await uploadImage(file);
        updateNodeData(id, { imageUrl: url, storagePath });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [id, updateNodeData],
  );

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const file = firstImageFile(event.clipboardData.items);
    if (!file) return;
    event.preventDefault();
    void handleFile(file);
  }

  useEffect(() => {
    if (!selected) return;

    function handleWindowPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || !event.clipboardData) return;
      const file = firstImageFile(event.clipboardData.items);
      if (!file) return;
      event.preventDefault();
      void handleFile(file);
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [handleFile, selected]);

  const imageUrl = data.imageUrl;
  const alias = data.alias.trim() || "image";
  const isReferenceHovered = hoveredReferenceNodeId === id;

  return (
    <div
      style={{
        width,
        height,
        ...(accent ? { outline: `2px solid ${accent}`, outlineOffset: 2 } : {}),
        ...highlight,
      }}
      onPaste={handlePaste}
      className={cn(
        "group bg-card relative flex flex-col gap-2 overflow-hidden rounded-lg border p-3 shadow-md",
        isReferenceHovered &&
          "ring-offset-background shadow-lg ring-2 ring-yellow-400 ring-offset-2",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.imageInput} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Upload className="size-4" />
        <span>Input</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Browse local image"
          title="Browse local image"
          className="nodrag ml-auto"
          onClick={() => inputRef.current?.click()}
        >
          <FolderOpen />
        </Button>
      </div>

      <Input
        value={data.alias}
        placeholder="alias"
        aria-label="Input alias"
        className="nodrag h-8 text-sm"
        onChange={(event) => updateNodeData(id, { alias: event.target.value })}
      />

      <div
        tabIndex={0}
        className="nodrag bg-muted/40 focus-visible:ring-ring relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border outline-none focus-visible:ring-2"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        {imageUrl ? (
          <>
            <ImagePreviewDialog
              src={imageUrl}
              alt={`${alias} input`}
              title={`@${alias} input image`}
              trigger={
                <button
                  type="button"
                  className="nodrag nopan focus-visible:ring-ring h-full min-h-0 w-full min-w-0 cursor-zoom-in overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  aria-label={`Enlarge @${alias} input image`}
                  title="Enlarge image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    draggable={false}
                    className="h-full min-h-0 w-full min-w-0 object-contain"
                  />
                </button>
              }
            />
            <ConfirmDialog
              title="Remove image?"
              description={`Remove the image from @${alias}?`}
              confirmLabel="Remove"
              onConfirm={() =>
                updateNodeData(id, {
                  imageUrl: null,
                  storagePath: null,
                })
              }
              trigger={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  aria-label="Remove input image"
                  title="Remove input image"
                  className="nodrag nopan absolute top-2 right-2 z-10 shadow-sm"
                >
                  <X />
                </Button>
              }
            />
          </>
        ) : uploading ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
            <ImageIcon className="size-6" />
            <span>Paste or drop image</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>

      <OutputPort color={NODE_PORT_COLORS.imageInput} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={200} minHeight={184} />
    </div>
  );
}
