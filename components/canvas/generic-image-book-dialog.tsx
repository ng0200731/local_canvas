"use client";

import { useState, type ReactElement } from "react";
import { Check, Images } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { GenericNodeImage } from "@/lib/workspace-settings";
import { cn } from "@/lib/utils";

export function GenericImageBookDialog({
  images,
  selectedImageId,
  title,
  trigger,
  onSelect,
}: {
  images: readonly GenericNodeImage[];
  selectedImageId: string | null;
  title: string;
  trigger: ReactElement;
  onSelect: (image: GenericNodeImage) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Select one of the {images.length} saved images to attach to this node.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {images.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((image, index) => {
                const selected = image.id === selectedImageId;
                return (
                  <button
                    key={image.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Select ${image.name}`}
                    onClick={() => {
                      onSelect(image);
                      setOpen(false);
                    }}
                    className={cn(
                      "focus-visible:ring-ring group relative grid gap-2 rounded-lg border p-2 text-left transition-colors outline-none focus-visible:ring-3",
                      selected
                        ? "border-primary bg-primary/5 ring-primary/20 ring-2"
                        : "hover:border-primary/40 hover:bg-muted/40",
                    )}
                  >
                    <span className="bg-muted/50 relative grid aspect-square place-items-center overflow-hidden rounded-md border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt=""
                        draggable={false}
                        className="size-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                      {selected ? (
                        <span className="bg-primary text-primary-foreground absolute top-2 right-2 grid size-6 place-items-center rounded-full shadow-sm">
                          <Check className="size-3.5" />
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 px-0.5">
                      <span className="block truncate text-xs font-medium">{image.name}</span>
                      <span className="text-muted-foreground text-[0.68rem]">
                        Image {index + 1}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
              <div className="grid gap-2">
                <Images className="mx-auto size-6" />
                <p className="text-sm">No saved images are available.</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
