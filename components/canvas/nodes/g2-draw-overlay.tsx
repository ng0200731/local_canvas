"use client";

/**
 * Full-screen drawing overlay for the G2 node.
 *
 * Draw Rect or Brush regions on the main image, in NATURAL image pixel space, so
 * masks render correctly regardless of the displayed size. Brush strokes auto-close
 * + auto-fill when released near the start point. All edits push the previous
 * g2Regions onto the node's undoStack (and clear redoStack). Undo/Redo/Clear/Save
 * operate by calling onRegionsChange / onHistoryChange back into the G2 node.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Brush, Eraser, RectangleHorizontal, Redo2, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { shouldCloseFreehandLoop } from "@/lib/image-mask";
import type { G2Region } from "@/lib/nodes/types";
import { getRegionColor } from "@/lib/nodes/g2";

const MIN_THICKNESS = 2;
const MAX_THICKNESS = 80;
const DEFAULT_THICKNESS = 16;
const DEFAULT_BRUSH_THRESHOLD_FACTOR = 1.5;

type Tool = "rect" | "freehand";

interface NaturalSize {
  width: number;
  height: number;
}

interface RectData {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface FreehandData {
  points: { x: number; y: number }[];
  closed?: boolean;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `g2r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read backend DOMRect of the image area, falling back to a synthetic sampler. */
function clientToImage(
  clientX: number,
  clientY: number,
  containerEl: HTMLDivElement,
  displayed: { width: number; height: number },
  natural: NaturalSize,
): { x: number; y: number } | null {
  const rect = containerEl.getBoundingClientRect();
  // Offset of the displayed (object-contain letterboxed) image inside the container.
  const scaleX = natural.width / displayed.width;
  const scaleY = natural.height / displayed.height;
  const scale = Math.max(scaleX, scaleY); // object-contain uses the larger scale
  // object-contain centers; compute the letterbox offsets.
  const drawnW = natural.width / scale;
  const drawnH = natural.height / scale;
  const offsetX = (displayed.width - drawnW) / 2;
  const offsetY = (displayed.height - drawnH) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (localX < 0 || localY < 0 || localX > drawnW || localY > drawnH) {
    // clamp to image bounds rather than drop the last point
  }
  return {
    x: Math.max(0, Math.min(natural.width, localX * scale)),
    y: Math.max(0, Math.min(natural.height, localY * scale)),
  };
}

export interface G2DrawOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  /** Current regions (natural-space). */
  regions: G2Region[];
  undoStack: G2Region[][];
  redoStack: G2Region[][];
  /** Commit new regions + updated history stacks. */
  onCommit: (regions: G2Region[], undoStack: G2Region[][], redoStack: G2Region[][]) => void;
}

export function G2DrawOverlay({
  open,
  onOpenChange,
  imageUrl,
  regions,
  undoStack,
  redoStack,
  onCommit,
}: G2DrawOverlayProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [displayed, setDisplayed] = useState<NaturalSize>({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>("freehand");
  const [thickness, setThickness] = useState(DEFAULT_THICKNESS);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [livePoints, setLivePoints] = useState<{ x: number; y: number }[]>([]);
  const [liveRect, setLiveRect] = useState<RectData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Track the displayed image size for scale conversion.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const img = imageRef.current;
      const stage = stageRef.current;
      if (!img || !stage) return;
      const r = stage.getBoundingClientRect();
      setDisplayed({ width: r.width, height: r.height });
      if (img.naturalWidth && img.naturalHeight) {
        setNatural({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (stageRef.current) ro.observe(stageRef.current);
    if (imageRef.current) ro.observe(imageRef.current);
    return () => ro.disconnect();
  }, [open, imageUrl]);

  // Also settle natural size once the image loads.
  function handleImageLoad() {
    const img = imageRef.current;
    if (!img) return;
    setNatural({ width: img.naturalWidth, height: img.naturalHeight });
  }

  const canDraw = Boolean(natural);

  function commit(next: G2Region[], prev: G2Region[]) {
    onCommit(next, [...undoStack, prev], []);
  }

  function pushRegion(region: G2Region) {
    commit([...regions, region], regions);
  }

  function handleStageDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canDraw || !natural || !stageRef.current) return;
    const pos = clientToImage(event.clientX, event.clientY, stageRef.current, displayed, natural);
    if (!pos) return;
    setDrawing(true);
    if (tool === "rect") {
      setDrawStart(pos);
      setLiveRect({ left: pos.x, top: pos.y, width: 0, height: 0 });
    } else {
      setLivePoints([pos]);
    }
  }

  function handleStageMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!drawing || !canDraw || !natural || !stageRef.current) return;
    const pos = clientToImage(event.clientX, event.clientY, stageRef.current, displayed, natural);
    if (!pos) return;
    if (tool === "rect" && drawStart) {
      setLiveRect({
        left: Math.min(drawStart.x, pos.x),
        top: Math.min(drawStart.y, pos.y),
        width: Math.abs(pos.x - drawStart.x),
        height: Math.abs(pos.y - drawStart.y),
      });
    } else if (tool === "freehand") {
      setLivePoints((prev) => [...prev, pos]);
    }
  }

  function handleStageUp() {
    if (!drawing) return;
    setDrawing(false);

    if (tool === "rect" && liveRect) {
      if (liveRect.width > 2 && liveRect.height > 2) {
        pushRegion({
          id: uid(),
          name: `region-${regions.length + 1}`,
          type: "rect",
          data: { ...liveRect },
          color: getRegionColor(regions.length),
          thickness,
        });
      }
    } else if (tool === "freehand" && livePoints.length > 1) {
      const closed = shouldCloseFreehandLoop(
        livePoints,
        thickness * DEFAULT_BRUSH_THRESHOLD_FACTOR,
      );
      pushRegion({
        id: uid(),
        name: `region-${regions.length + 1}`,
        type: "freehand",
        data: { points: [...livePoints], closed },
        color: getRegionColor(regions.length),
        thickness,
      });
    }
    setLivePoints([]);
    setLiveRect(null);
    setDrawStart(null);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    onCommit(prev, undoStack.slice(0, -1), [...redoStack, regions]);
  }
  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    onCommit(next, [...undoStack, regions], redoStack.slice(0, -1));
  }
  function clearAll() {
    if (regions.length === 0) return;
    onCommit([], [...undoStack, regions], []);
  }
  function deleteRegion(id: string) {
    commit(
      regions.filter((r) => r.id !== id),
      regions,
    );
  }
  function renameRegion(id: string, name: string) {
    onCommit(
      regions.map((r) => (r.id === id ? { ...r, name } : r)),
      undoStack,
      redoStack,
    );
  }

  // The SVG coordinate space is the image's natural size; we render the image
  // inside the stage at object-contain and size the SVG to match the displayed
  // box but keep viewBox in natural space so paths draw correctly.
  const svgViewBox = useMemo(
    () => (natural ? `0 0 ${natural.width} ${natural.height}` : "0 0 100 100"),
    [natural],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl bg-background text-foreground shadow-2xl ring-1 ring-foreground/10 outline-none"
        >
          <DialogTitle className="sr-only">Draw regions on the main image</DialogTitle>
          {/* Header */}
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 text-sm font-medium">
            <Brush className="size-4" />
            Region editor
            <span className="text-muted-foreground text-xs">
              {regions.length} region{regions.length === 1 ? "" : "s"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" size="icon-sm" variant="ghost" disabled={undoStack.length === 0} onClick={undo} title="Undo">
                <Undo2 className="size-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" disabled={redoStack.length === 0} onClick={redo} title="Redo">
                <Redo2 className="size-4" />
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={regions.length === 0} onClick={clearAll} title="Clear all regions">
                <Eraser className="size-3.5" />
                Clear
              </Button>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Left toolbar */}
            <div className="flex w-48 shrink-0 flex-col gap-3 border-r p-3">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Tool</span>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "rect" ? "default" : "outline"}
                    onClick={() => setTool("rect")}
                  >
                    <RectangleHorizontal className="size-4" />
                    Rect
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === "freehand" ? "default" : "outline"}
                    onClick={() => setTool("freehand")}
                  >
                    <Brush className="size-4" />
                    Brush
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">
                  Thickness{tool === "freehand" ? "" : " (brush only)"}
                </span>
                <SliderPrimitive.Root
                  value={thickness}
                  onValueChange={(value) => setThickness(Number(value))}
                  min={MIN_THICKNESS}
                  max={MAX_THICKNESS}
                  step={1}
                  disabled={tool !== "freehand"}
                  className="relative flex h-5 w-full touch-none select-none items-center"
                >
                  <SliderPrimitive.Track className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full">
                    <SliderPrimitive.Indicator className="bg-primary absolute h-full" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb className="border-primary bg-background block size-4 rounded-full border-2 shadow transition-colors focus-visible:ring-2 focus-visible:ring-ring" />
                </SliderPrimitive.Root>
                <span className="font-mono text-xs">{thickness}px</span>
              </div>
              <p className="text-muted-foreground mt-auto text-xs leading-4">
                Brush auto-fills a closed loop when you release near the start.
                Regions are named (e.g. <span className="font-mono">collar</span>) and used in
                the prompt as <span className="font-mono">@collar</span>.
              </p>
            </div>

            {/* Stage */}
            <div
              ref={stageRef}
              onMouseDown={handleStageDown}
              onMouseMove={handleStageMove}
              onMouseUp={handleStageUp}
              onMouseLeave={() => {
                if (drawing) handleStageUp();
              }}
              className="bg-muted/30 relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
              style={{ cursor: "crosshair" }}
            >
              <div className="relative" style={{ maxWidth: "100%", maxHeight: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Main"
                  onLoad={handleImageLoad}
                  draggable={false}
                  className="block max-h-[calc(100dvh-6rem)] max-w-full select-none object-contain"
                />
                {natural && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={svgViewBox}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {regions.map((region) => {
                      if (region.type === "rect") {
                        const d = region.data as unknown as RectData;
                        return (
                          <g key={region.id}>
                            <rect
                              x={d.left}
                              y={d.top}
                              width={d.width}
                              height={d.height}
                              fill={`${region.color}33`}
                              stroke={region.color}
                              strokeWidth={Math.max(2, (thickness * (natural.width / Math.max(1, displayed.width))) || 2)}
                              rx={2}
                            />
                            <text
                              x={d.left + 4}
                              y={d.top + 14}
                              fill={region.color}
                              fontSize={Math.max(12, natural.height * 0.022)}
                              fontWeight="bold"
                              className="select-none"
                            >
                              {region.name}
                            </text>
                          </g>
                        );
                      }
                      const fp = region.data as unknown as FreehandData;
                      if (!fp.points || fp.points.length < 2) return null;
                      const pathD =
                        fp.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") +
                        (fp.closed ? " Z" : "");
                      return (
                        <g key={region.id}>
                          <path
                            d={pathD}
                            fill={fp.closed ? `${region.color}33` : "none"}
                            stroke={region.color}
                            strokeWidth={region.thickness}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <text
                            x={fp.points[0]!.x + 4}
                            y={fp.points[0]!.y + 14}
                            fill={region.color}
                            fontSize={Math.max(12, natural.height * 0.022)}
                            fontWeight="bold"
                            className="select-none"
                          >
                            {region.name}
                          </text>
                        </g>
                      );
                    })}

                    {/* Live drawing */}
                    {drawing && tool === "rect" && liveRect && (
                      <rect
                        x={liveRect.left}
                        y={liveRect.top}
                        width={liveRect.width}
                        height={liveRect.height}
                        fill={`${getRegionColor(regions.length)}22`}
                        stroke={getRegionColor(regions.length)}
                        strokeWidth={4}
                        strokeDasharray="6 4"
                      />
                    )}
                    {drawing && tool === "freehand" && livePoints.length > 1 && (
                      <path
                        d={livePoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={getRegionColor(regions.length)}
                        strokeWidth={thickness}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.7}
                      />
                    )}
                  </svg>
                )}
              </div>
            </div>

            {/* Right regions list */}
            <div className="flex w-56 shrink-0 flex-col gap-2 border-l p-3">
              <span className="text-muted-foreground text-xs">Regions ({regions.length})</span>
              <div className="flex flex-col gap-1 overflow-y-auto">
                {regions.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    Draw a region with Rect or Brush, then name it here.
                  </p>
                )}
                {regions.map((region) => (
                  <div
                    key={region.id}
                    className="bg-background flex items-center gap-2 rounded-md border px-2 py-1"
                  >
                    <div
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: region.color }}
                    />
                    {editingId === region.id ? (
                      <Input
                        defaultValue={region.name}
                        autoFocus
                        className="h-6 px-1 text-xs"
                        onBlur={(e) => {
                          renameRegion(region.id, e.target.value);
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameRegion(region.id, e.currentTarget.value);
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <span
                        className="flex-1 cursor-pointer truncate text-xs hover:underline"
                        onClick={() => setEditingId(region.id)}
                        title="Click to rename (used as @alias)"
                      >
                        {region.name}
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive size-4 shrink-0"
                      onClick={() => deleteRegion(region.id)}
                      title="Delete region"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
