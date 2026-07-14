"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ImagePlus, Images, Loader2, Trash2, Upload } from "lucide-react";
import { z } from "zod";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Button } from "@/components/ui/button";
import {
  MAX_GENERIC_NODE_IMAGES,
  genericNodeImageListSchema,
  type GenericNodeImage,
} from "@/lib/workspace-settings";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/lib/upload";
import { OrderControls } from "./order-controls";

const imageFileSchema = z.custom<File>(
  (value) =>
    typeof File !== "undefined" &&
    value instanceof File &&
    value.type.startsWith("image/") &&
    value.size <= 20 * 1024 * 1024,
  { message: "Choose image files no larger than 20 MB each." },
);

const imageFilesSchema = z
  .array(imageFileSchema)
  .min(1, "Choose at least one image file.")
  .max(MAX_GENERIC_NODE_IMAGES, `Choose no more than ${MAX_GENERIC_NODE_IMAGES} images.`);

function imageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileName(file: File, index: number): string {
  return file.name.trim().slice(0, 255) || `Image ${index + 1}`;
}

export function MultiImageUploadField({
  images,
  disabled = false,
  onChange,
  onBusyChange,
}: {
  images: readonly GenericNodeImage[];
  disabled?: boolean;
  onChange: (images: GenericNodeImage[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingest(values: readonly File[]) {
    const parsed = imageFilesSchema.safeParse([...values]);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose image files.");
      return;
    }
    if (images.length + parsed.data.length > MAX_GENERIC_NODE_IMAGES) {
      setError(`A generic node can contain up to ${MAX_GENERIC_NODE_IMAGES} images.`);
      return;
    }

    setError(null);
    setUploading(true);
    onBusyChange?.(true);
    const uploaded: GenericNodeImage[] = [];
    const failures: string[] = [];
    for (const [index, file] of parsed.data.entries()) {
      try {
        const result = await uploadImage(file);
        uploaded.push({
          id: imageId(),
          name: fileName(file, index),
          url: result.url,
          storagePath: result.storagePath,
        });
      } catch (uploadError) {
        failures.push(
          uploadError instanceof Error ? `${file.name}: ${uploadError.message}` : file.name,
        );
      }
    }

    try {
      if (uploaded.length) {
        const next = [...images, ...uploaded];
        onChange(genericNodeImageListSchema.parse(next));
      }
      if (failures.length) {
        setError(`${failures.length} image${failures.length === 1 ? "" : "s"} failed to upload.`);
      }
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!disabled && !uploading) void ingest(Array.from(event.dataTransfer.files));
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length || disabled || uploading) return;
    event.preventDefault();
    void ingest(files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    inputRef.current?.click();
  }

  function moveImage(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= images.length) return;
    const next = [...images];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      <div
        tabIndex={disabled ? -1 : 0}
        aria-label="Generic node image uploads"
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragActive(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          "border-input focus-visible:ring-ring/50 relative grid min-h-36 place-items-center rounded-lg border border-dashed p-4 text-center transition-colors outline-none focus-visible:ring-3",
          dragActive && "border-primary bg-primary/5 ring-primary/20 ring-3",
          (disabled || uploading) && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
            <Loader2 className="size-6 animate-spin" />
            <span>Uploading images...</span>
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-3 text-sm">
            <span className="bg-secondary text-secondary-foreground grid size-11 place-items-center rounded-md">
              {images.length ? <Images className="size-5" /> : <ImagePlus className="size-5" />}
            </span>
            <div>
              <p className="text-foreground font-medium">
                {images.length ? "Add more node images" : "Upload node images"}
              </p>
              <p className="mt-1 text-xs">Drop, paste, or choose multiple images · 20 MB each</p>
            </div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload /> Choose images
            </Button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void ingest(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </div>

      {images.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="bg-muted/20 flex min-w-0 items-center gap-2 rounded-lg border p-2"
            >
              <ImagePreviewDialog
                src={image.url}
                alt={image.name}
                title={image.name}
                gallery={images.map((item) => ({ src: item.url, alt: item.name }))}
                initialIndex={index}
                trigger={
                  <button
                    type="button"
                    className="focus-visible:ring-ring bg-muted grid size-14 shrink-0 cursor-zoom-in place-items-center overflow-hidden rounded-md border outline-none focus-visible:ring-2"
                    aria-label={`Preview ${image.name}`}
                    title={`Preview ${image.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="size-full object-contain" />
                  </button>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={image.name}>
                  {image.name}
                </p>
                <p className="text-muted-foreground text-[0.68rem]">Image {index + 1}</p>
              </div>
              <div className="flex shrink-0 items-center">
                <OrderControls
                  label={image.name}
                  index={index}
                  total={images.length}
                  disabled={disabled || uploading}
                  onMove={(direction) => moveImage(index, direction)}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${image.name}`}
                  title={`Remove ${image.name}`}
                  disabled={disabled || uploading}
                  onClick={() => onChange(images.filter((candidate) => candidate.id !== image.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
