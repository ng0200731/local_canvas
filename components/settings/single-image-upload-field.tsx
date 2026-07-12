"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadImage, type UploadResult } from "@/lib/upload";

const imageFileSchema = z.custom<File>(
  (value) =>
    typeof File !== "undefined" &&
    value instanceof File &&
    value.type.startsWith("image/") &&
    value.size <= 20 * 1024 * 1024,
  { message: "Choose an image file no larger than 20 MB." },
);

export function SingleImageUploadField({
  imageUrl,
  disabled = false,
  onChange,
  onBusyChange,
}: {
  imageUrl: string;
  disabled?: boolean;
  onChange: (result: UploadResult | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingest(value: unknown) {
    const parsed = imageFileSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose an image file.");
      return;
    }

    setError(null);
    setUploading(true);
    onBusyChange?.(true);
    try {
      onChange(await uploadImage(parsed.data));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled && !uploading) void ingest(event.dataTransfer.files[0]);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!file || disabled || uploading) return;
    event.preventDefault();
    void ingest(file);
  }

  return (
    <div className="grid gap-2">
      <div
        tabIndex={disabled ? -1 : 0}
        aria-label="Generic node image upload"
        onPaste={handlePaste}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          "border-input focus-visible:ring-ring/50 relative grid min-h-56 place-items-center overflow-hidden rounded-lg border border-dashed p-4 text-center outline-none focus-visible:ring-3",
          (disabled || uploading) && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
            <Loader2 className="size-6 animate-spin" />
            <span>Uploading image...</span>
          </div>
        ) : imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Generic node preview"
              className="max-h-64 w-full object-contain"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              className="absolute top-2 right-2 shadow-sm"
              aria-label="Remove generic node image"
              title="Remove image"
              onClick={() => {
                setError(null);
                onChange(null);
              }}
            >
              <X />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-background/90 absolute bottom-2 left-2 shadow-sm"
              onClick={() => inputRef.current?.click()}
            >
              <Upload /> Replace
            </Button>
          </>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-3 text-sm">
            <span className="bg-secondary text-secondary-foreground grid size-11 place-items-center rounded-md">
              <ImagePlus className="size-5" />
            </span>
            <div>
              <p className="text-foreground font-medium">Node image</p>
              <p className="mt-1 text-xs">PNG, JPEG, or WebP up to 20 MB</p>
            </div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload /> Choose image
            </Button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void ingest(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
