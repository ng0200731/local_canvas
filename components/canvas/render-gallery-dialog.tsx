"use client";

import { useState } from "react";
import { Download, Images, LoaderCircle } from "lucide-react";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadImageFile } from "@/lib/download-image";
import { getModelDisplayName } from "@/lib/image-generation-models";
import { getCanvasStore, type ImageRecord } from "@/lib/store";

interface RenderGalleryDialogProps {
  canvasId: string;
}

function resolutionBadge(image: ImageRecord): string {
  return image.modelDetails?.resolution ?? "Unknown";
}

function sizeBadge(image: ImageRecord): string {
  const size = image.modelDetails?.size;
  if (size === "1024x1024") return "Square";
  if (size === "1536x1024") return "Wide";
  if (size === "1024x1536") return "Tall";
  return "Unknown";
}

function formatBadge(image: ImageRecord): string {
  const format = image.modelDetails?.outputFormat?.toUpperCase();
  return format || "Unknown";
}

function modelSummary(image: ImageRecord): string {
  const details = image.modelDetails;
  const model = details?.model ?? image.model;
  return [getModelDisplayName(model), details?.size, details?.resolution, details?.outputFormat]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

function creationDateTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function RenderGalleryDialog({ canvasId }: RenderGalleryDialogProps) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const previewItems = images.map((image) => ({
    src: image.url,
    alt: image.prompt ?? "Generated image",
  }));

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setLoading(true);
    setError(null);
    try {
      setImages(await getCanvasStore().listImages(canvasId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Failed to load renders");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(image: ImageRecord) {
    setDownloadingId(image.id);
    try {
      await downloadImageFile({
        url: image.url,
        baseName: `render-${image.createdAt.replaceAll(":", "-")}`,
        outputFormat: image.modelDetails?.outputFormat,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to download render.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline" className="shadow-sm">
            <Images />
            Renders
          </Button>
        }
      />
      <DialogContent className="h-[min(46rem,calc(100dvh-2rem))] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Rendered images</DialogTitle>
          <DialogDescription>
            {images.length} saved result{images.length === 1 ? "" : "s"} from this canvas.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 px-5 pb-5">
          {loading ? (
            <div className="text-muted-foreground flex h-64 items-center justify-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              Loading renders...
            </div>
          ) : error ? (
            <div className="text-destructive flex h-64 items-center justify-center text-sm">
              {error}
            </div>
          ) : images.length === 0 ? (
            <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-3 text-center text-sm">
              <Images className="size-8" />
              <p>No rendered images yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((image, index) => (
                <article
                  key={image.id}
                  className="group bg-card overflow-hidden rounded-md border shadow-sm"
                >
                  <div className="bg-muted relative">
                    <ImagePreviewDialog
                      src={image.url}
                      alt={image.prompt ?? "Generated image"}
                      title="Rendered image preview"
                      gallery={previewItems}
                      initialIndex={index}
                      trigger={
                        <button
                          type="button"
                          className="focus-visible:ring-ring block aspect-square w-full cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={image.prompt ?? "Generated image"}
                            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          />
                        </button>
                      }
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="absolute right-2 bottom-2 shadow-md"
                      aria-label="Download rendered image"
                      title="Download rendered image"
                      disabled={downloadingId === image.id}
                      onClick={() => void handleDownload(image)}
                    >
                      {downloadingId === image.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Download />
                      )}
                    </Button>
                  </div>
                  <div className="flex min-h-32 flex-col gap-2 p-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{resolutionBadge(image)}</Badge>
                      <Badge variant="secondary">{sizeBadge(image)}</Badge>
                      <Badge variant="secondary">{formatBadge(image)}</Badge>
                    </div>
                    <p className="text-foreground line-clamp-3 text-xs leading-5">
                      {image.prompt ?? "No prompt saved"}
                    </p>
                    <p className="text-muted-foreground mt-auto truncate text-[0.7rem] font-medium">
                      {modelSummary(image) || "No model details"}
                    </p>
                    <time
                      dateTime={image.createdAt}
                      className="text-muted-foreground text-[0.68rem] tabular-nums"
                    >
                      {creationDateTime(image.createdAt)}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
