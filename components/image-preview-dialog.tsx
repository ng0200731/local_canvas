"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent,
} from "react";
import { Mouse, Move, X } from "lucide-react";

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

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;

interface Point {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  start: Point;
  origin: Point;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function ImagePreviewDialog({ src, alt, title, trigger }: ImagePreviewDialogProps) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setZoom((current) => {
      const nextZoom = clampZoom(Number((current + direction * ZOOM_STEP).toFixed(2)));
      if (nextZoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return nextZoom;
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoom <= MIN_ZOOM) return;
      if (event.target instanceof Element && event.target.closest("button")) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: pan,
      };
      setIsPanning(true);
    },
    [pan, zoom],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    });
  }, []);

  const stopPanning = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
      setIsPanning(false);
    }
  }, []);

  const resetPreview = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    dragRef.current = null;
  }, []);

  return (
    <Dialog onOpenChange={(open) => open && resetPreview()}>
      <DialogTrigger render={trigger} />
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg bg-black/90 p-3 ring-white/15 sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Enlarged image preview. Scroll the mouse wheel to zoom, drag the image to pan, or press
          Escape to dismiss.
        </DialogDescription>
        <div
          className={`relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden ${
            zoom > MIN_ZOOM ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          }`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPanning}
          onPointerCancel={stopPanning}
        >
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-black/75 px-3 py-2 text-xs font-medium text-white shadow-xl ring-1 ring-white/20 backdrop-blur">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Mouse className="size-3.5" aria-hidden="true" />
              Scroll to zoom
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Move className="size-3.5" aria-hidden="true" />
              Drag to pan
            </span>
            <span className="whitespace-nowrap text-white/70">{Math.round(zoom * 100)}%</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-100 ease-out"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
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
