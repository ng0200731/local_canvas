"use client";

import type { ReactElement } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ImagePreviewDialogProps {
  src: string;
  alt: string;
  title: string;
  trigger: ReactElement;
}

export function ImagePreviewDialog({ src, alt, title, trigger }: ImagePreviewDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg bg-black/90 p-3 ring-white/15 sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Enlarged image preview. Press Escape or use the close button to dismiss.
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
          <DialogClose
            render={
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-0 right-0 shadow-lg"
                aria-label="Close image preview"
                title="Close image preview"
              />
            }
          >
            <X />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
