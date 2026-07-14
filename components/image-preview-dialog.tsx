"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type SyntheticEvent,
  type WheelEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Mouse,
  Move,
  PenLine,
  Pipette,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Unlock,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_MASK_BRUSH_THICKNESS,
  MIN_MASK_BRUSH_THICKNESS,
  clampMaskBrushThickness,
  excludeSelectedPixels,
  selectSimilarColorPixels,
  shouldCloseFreehandLoop,
} from "@/lib/image-mask";
import type {
  ImageMaskColorScope,
  ImageMaskColorSelection,
  ImageMaskRegion,
  ImageMaskStroke,
} from "@/lib/nodes/types";
import { cn } from "@/lib/utils";

interface ImagePreviewDialogProps {
  src: string;
  alt: string;
  title: string;
  trigger: ReactElement;
  gallery?: readonly ImagePreviewItem[];
  initialIndex?: number;
  selectedItemId?: string | null;
  selectLabel?: string;
  selectedLabel?: string;
  onSelect?: (item: ImagePreviewItem, index: number) => void;
  masks?: readonly ImageMaskRegion[];
  onMasksChange?: (masks: ImageMaskRegion[]) => void;
}

export interface ImagePreviewItem {
  id?: string;
  src: string;
  alt: string;
  storagePath?: string | null;
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

interface DrawState {
  pointerId: number;
  stroke: ImageMaskStroke;
}

interface PixelSource {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

interface SampledColor {
  hex: string;
  rgb: readonly [number, number, number];
  alpha: number;
  point: Point;
  thumbnailUrl: string | null;
}

interface SelectionMapPreview {
  url: string;
  selectedPercent: number;
}

interface ImageSize {
  width: number;
  height: number;
}

type MaskTool = "pen" | "color" | "pan";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `mask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function isMaskControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-mask-controls='true']"));
}

function componentToHex(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0").toUpperCase();
}

function rgbaToHex(red: number, green: number, blue: number): string {
  return `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
}

function colorThumbnailUrl(source: PixelSource, x: number, y: number): string | null {
  const sampleSize = 15;
  const outputSize = 60;
  const half = Math.floor(sampleSize / 2);
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleContext = sampleCanvas.getContext("2d");
  if (!sampleContext) return null;
  const imageData = sampleContext.createImageData(sampleSize, sampleSize);

  for (let row = 0; row < sampleSize; row += 1) {
    for (let column = 0; column < sampleSize; column += 1) {
      const sourceX = Math.min(source.width - 1, Math.max(0, x + column - half));
      const sourceY = Math.min(source.height - 1, Math.max(0, y + row - half));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (row * sampleSize + column) * 4;
      imageData.data[targetOffset] = source.pixels[sourceOffset] ?? 0;
      imageData.data[targetOffset + 1] = source.pixels[sourceOffset + 1] ?? 0;
      imageData.data[targetOffset + 2] = source.pixels[sourceOffset + 2] ?? 0;
      imageData.data[targetOffset + 3] = source.pixels[sourceOffset + 3] ?? 0;
    }
  }

  sampleContext.putImageData(imageData, 0, 0);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) return null;
  outputContext.imageSmoothingEnabled = false;
  outputContext.drawImage(sampleCanvas, 0, 0, outputSize, outputSize);
  outputContext.strokeStyle = "rgb(255 255 255)";
  outputContext.lineWidth = 2;
  outputContext.strokeRect(outputSize / 2 - 4, outputSize / 2 - 4, 8, 8);
  outputContext.strokeStyle = "rgb(0 0 0)";
  outputContext.lineWidth = 1;
  outputContext.strokeRect(outputSize / 2 - 5, outputSize / 2 - 5, 10, 10);
  return outputCanvas.toDataURL("image/png");
}

function samplePixelColor(source: PixelSource, point: Point): SampledColor | null {
  const x = Math.min(source.width - 1, Math.max(0, Math.floor(point.x * source.width)));
  const y = Math.min(source.height - 1, Math.max(0, Math.floor(point.y * source.height)));
  const offset = (y * source.width + x) * 4;
  if (offset < 0 || offset + 3 >= source.pixels.length) return null;
  const red = source.pixels[offset] ?? 0;
  const green = source.pixels[offset + 1] ?? 0;
  const blue = source.pixels[offset + 2] ?? 0;
  const alpha = source.pixels[offset + 3] ?? 0;
  return {
    hex: rgbaToHex(red, green, blue),
    rgb: [red, green, blue],
    alpha,
    point,
    thumbnailUrl: colorThumbnailUrl(source, x, y),
  };
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: ImageMaskStroke,
  width: number,
  height: number,
  color: string,
  fillColor: string,
) {
  const first = stroke.points[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first.x * width, first.y * height);
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x * width, point.y * height);
  }
  if (stroke.closed) {
    context.closePath();
    context.fillStyle = fillColor;
    context.fill();
  }
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = clampMaskBrushThickness(stroke.thickness);
  context.stroke();
}

function colorSelectionPixels(
  source: PixelSource,
  selection: ImageMaskColorSelection,
): Uint8ClampedArray {
  return selectSimilarColorPixels({
    pixels: source.pixels,
    width: source.width,
    height: source.height,
    seedX: selection.seed.x * source.width,
    seedY: selection.seed.y * source.height,
    tolerance: selection.tolerance,
    scope: selection.scope,
  });
}

function applySelectionPixels(
  overlay: ImageData,
  selected: Uint8ClampedArray,
  color: readonly [number, number, number, number],
) {
  for (let index = 0; index < selected.length; index += 1) {
    if (!selected[index]) continue;
    const offset = index * 4;
    overlay.data[offset] = color[0];
    overlay.data[offset + 1] = color[1];
    overlay.data[offset + 2] = color[2];
    overlay.data[offset + 3] = Math.max(overlay.data[offset + 3], color[3]);
  }
}

function selectionMapPreviewUrl(
  source: PixelSource,
  selected: Uint8ClampedArray,
): SelectionMapPreview | null {
  if (source.width <= 0 || source.height <= 0 || selected.length === 0) return null;
  const previewWidth = 132;
  const previewHeight = Math.max(44, Math.round((previewWidth * source.height) / source.width));
  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = Math.min(92, previewHeight);
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.createImageData(canvas.width, canvas.height);
  let selectedCount = 0;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < selected.length; index += 1) {
    if (!selected[index]) continue;
    selectedCount += 1;
    const x = index % source.width;
    const y = Math.floor(index / source.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x / canvas.width) * source.width));
      const sourceY = Math.min(source.height - 1, Math.floor((y / canvas.height) * source.height));
      const sourceIndex = sourceY * source.width + sourceX;
      const sourceOffset = sourceIndex * 4;
      const targetOffset = (y * canvas.width + x) * 4;
      const red = source.pixels[sourceOffset] ?? 0;
      const green = source.pixels[sourceOffset + 1] ?? 0;
      const blue = source.pixels[sourceOffset + 2] ?? 0;
      const luminance = Math.round((red + green + blue) / 3);
      if (selected[sourceIndex]) {
        imageData.data[targetOffset] = 34;
        imageData.data[targetOffset + 1] = 211;
        imageData.data[targetOffset + 2] = 238;
        imageData.data[targetOffset + 3] = 245;
      } else {
        imageData.data[targetOffset] = Math.round(luminance * 0.45);
        imageData.data[targetOffset + 1] = Math.round(luminance * 0.45);
        imageData.data[targetOffset + 2] = Math.round(luminance * 0.45);
        imageData.data[targetOffset + 3] = 210;
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  if (selectedCount > 0) {
    const rectX = (minX / source.width) * canvas.width;
    const rectY = (minY / source.height) * canvas.height;
    const rectWidth = ((maxX - minX + 1) / source.width) * canvas.width;
    const rectHeight = ((maxY - minY + 1) / source.height) * canvas.height;
    context.strokeStyle = "rgb(255 255 255)";
    context.lineWidth = 2;
    context.strokeRect(rectX, rectY, rectWidth, rectHeight);
    context.strokeStyle = "rgb(8 47 73)";
    context.lineWidth = 1;
    context.strokeRect(rectX + 1, rectY + 1, Math.max(0, rectWidth - 2), Math.max(0, rectHeight - 2));
  }

  return {
    url: canvas.toDataURL("image/png"),
    selectedPercent: selectedCount / Math.max(1, source.width * source.height),
  };
}

function rasterizeStrokePixels(
  strokes: readonly ImageMaskStroke[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const selected = new Uint8ClampedArray(Math.max(0, width * height));
  if (width <= 0 || height <= 0 || strokes.length === 0) return selected;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return selected;
  for (const stroke of strokes) {
    drawStroke(context, stroke, width, height, "rgb(255 255 255 / 1)", "rgb(255 255 255 / 1)");
  }
  const imageData = context.getImageData(0, 0, width, height);
  for (let index = 0; index < selected.length; index += 1) {
    if (imageData.data[index * 4 + 3] > 0) selected[index] = 255;
  }
  return selected;
}

function mergeSelectionPixels(target: Uint8ClampedArray, source: Uint8ClampedArray) {
  const length = Math.min(target.length, source.length);
  for (let index = 0; index < length; index += 1) {
    if (source[index]) target[index] = 255;
  }
}

function selectedPixelsForMask(
  source: PixelSource,
  mask: ImageMaskRegion,
  maskLookup: ReadonlyMap<string, ImageMaskRegion>,
  visited = new Set<string>(),
): Uint8ClampedArray {
  const selected = rasterizeStrokePixels(mask.strokes, source.width, source.height);
  for (const selection of mask.colorSelections ?? []) {
    mergeSelectionPixels(selected, colorSelectionPixels(source, selection));
  }
  if (!mask.excludedMaskIds?.length || visited.has(mask.id)) return selected;
  visited.add(mask.id);
  const excluded = mask.excludedMaskIds
    .map((maskId) => maskLookup.get(maskId))
    .filter((candidate): candidate is ImageMaskRegion => Boolean(candidate))
    .map((excludedMask) => selectedPixelsForMask(source, excludedMask, maskLookup, visited));
  visited.delete(mask.id);
  return excluded.length ? excludeSelectedPixels(selected, excluded) : selected;
}

function selectedColorPixelsForMask(
  source: PixelSource,
  mask: ImageMaskRegion,
  maskLookup: ReadonlyMap<string, ImageMaskRegion>,
): Uint8ClampedArray {
  const selected = new Uint8ClampedArray(Math.max(0, source.width * source.height));
  for (const selection of mask.colorSelections ?? []) {
    mergeSelectionPixels(selected, colorSelectionPixels(source, selection));
  }
  if (!mask.excludedMaskIds?.length) return selected;
  const excluded = mask.excludedMaskIds
    .map((maskId) => maskLookup.get(maskId))
    .filter((candidate): candidate is ImageMaskRegion => Boolean(candidate))
    .map((excludedMask) => selectedPixelsForMask(source, excludedMask, maskLookup));
  return excluded.length ? excludeSelectedPixels(selected, excluded) : selected;
}

function SampledColorPreview({
  sampledColor,
  locked,
  emptyText,
  onUnlock,
}: {
  sampledColor: SampledColor | null;
  locked: boolean;
  emptyText: string;
  onUnlock: () => void;
}) {
  if (!sampledColor) return <p className="text-xs text-white/65">{emptyText}</p>;

  return (
    <div className="grid grid-cols-[60px_1fr] items-center gap-2 rounded-md bg-white/10 p-2">
      {sampledColor.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sampledColor.thumbnailUrl}
          alt={`Sampled color thumbnail ${sampledColor.hex}`}
          className="size-[60px] rounded border border-white/35 object-cover"
          draggable={false}
        />
      ) : (
        <span
          className="size-[60px] rounded border border-white/35"
          style={{ backgroundColor: sampledColor.hex }}
          aria-label={`Sampled color ${sampledColor.hex}`}
        />
      )}
      <span className="grid min-w-0 gap-1 text-xs">
        <span className="flex items-center gap-2">
          <span
            className="size-5 shrink-0 rounded border border-white/35"
            style={{ backgroundColor: sampledColor.hex }}
            aria-hidden="true"
          />
          <span className="truncate font-mono font-semibold text-white">{sampledColor.hex}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[0.65rem] text-white/65">
            {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            {locked ? "Locked" : "Live"}
          </span>
        </span>
        <span className="text-white/70">
          RGB {sampledColor.rgb.join(", ")} / Alpha {sampledColor.alpha}
        </span>
        {locked ? (
          <button
            type="button"
            className="mt-1 justify-self-start rounded-sm px-1.5 py-0.5 text-[0.65rem] font-medium text-cyan-100 ring-1 ring-cyan-200/35 hover:bg-cyan-300/15"
            onClick={onUnlock}
          >
            Unlock
          </button>
        ) : null}
      </span>
    </div>
  );
}

function SelectionMapPreviewCard({ preview }: { preview: SelectionMapPreview | null }) {
  if (!preview) {
    return (
      <div className="grid gap-1 rounded-md border border-dashed border-white/20 bg-white/5 p-2">
        <span className="text-xs font-medium text-white/80">Selection map</span>
        <span className="text-xs text-white/55">Click the image to see the selected pattern.</span>
      </div>
    );
  }

  return (
    <div className="grid gap-1 rounded-md bg-white/10 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-white/80">Selection map</span>
        <span className="font-mono text-[0.65rem] text-cyan-100">
          {(preview.selectedPercent * 100).toFixed(1)}%
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.url}
        alt="Selected region map"
        className="w-full rounded border border-cyan-200/35 object-contain"
        draggable={false}
      />
    </div>
  );
}

export function ImagePreviewDialog({
  src,
  alt,
  title,
  trigger,
  gallery,
  initialIndex = 0,
  selectedItemId = null,
  selectLabel = "Select",
  selectedLabel = "Selected",
  onSelect,
  masks = [],
  onMasksChange,
}: ImagePreviewDialogProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [maskMode, setMaskMode] = useState(false);
  const [maskTool, setMaskTool] = useState<MaskTool>("pen");
  const [maskName, setMaskName] = useState("");
  const [strokeThickness, setStrokeThickness] = useState(24);
  const [colorTolerance, setColorTolerance] = useState(12);
  const [colorScope, setColorScope] = useState<ImageMaskColorScope>("region");
  const [draftStrokes, setDraftStrokes] = useState<ImageMaskStroke[]>([]);
  const [draftColorSelections, setDraftColorSelections] = useState<ImageMaskColorSelection[]>([]);
  const [draftExcludedMaskIds, setDraftExcludedMaskIds] = useState<string[]>([]);
  const [pixelSource, setPixelSource] = useState<PixelSource | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [imageDisplaySize, setImageDisplaySize] = useState<ImageSize | null>(null);
  const [pixelError, setPixelError] = useState<string | null>(null);
  const [hoveredMaskId, setHoveredMaskId] = useState<string | null>(null);
  const [eyeHoveredMaskId, setEyeHoveredMaskId] = useState<string | null>(null);
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [hiddenMaskIds, setHiddenMaskIds] = useState<string[]>([]);
  const [sampledColor, setSampledColor] = useState<SampledColor | null>(null);
  const [sampledColorLocked, setSampledColorLocked] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const drawRef = useRef<DrawState | null>(null);
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewItems = gallery?.length ? gallery : [{ src, alt }];
  const safeIndex = Math.min(Math.max(currentIndex, 0), previewItems.length - 1);
  const currentItem = previewItems[safeIndex] ?? { src, alt };
  const hasPrevious = safeIndex > 0;
  const hasNext = safeIndex < previewItems.length - 1;
  const currentItemSelected =
    selectedItemId !== null && currentItem.id !== undefined && currentItem.id === selectedItemId;
  const currentImageKey = currentItem.id ?? currentItem.src;
  const showingMaskImage = selectedItemId === null || currentItemSelected;
  const canEditMasks = Boolean(onMasksChange && showingMaskImage);
  const visibleMasks = useMemo(
    () =>
      showingMaskImage
        ? masks.filter((mask) => !mask.imageKey || mask.imageKey === currentImageKey)
        : [],
    [currentImageKey, masks, showingMaskImage],
  );
  const visibleHoveredMaskId = visibleMasks.some(
    (mask) => mask.id === hoveredMaskId && !hiddenMaskIds.includes(mask.id),
  )
    ? hoveredMaskId
    : null;
  const visibleEyeHoveredMaskId = visibleMasks.some(
    (mask) => mask.id === eyeHoveredMaskId && !hiddenMaskIds.includes(mask.id),
  )
    ? eyeHoveredMaskId
    : null;
  const visibleSelectedMaskId = visibleMasks.some(
    (mask) => mask.id === selectedMaskId && !hiddenMaskIds.includes(mask.id),
  )
    ? selectedMaskId
    : null;
  const activeMaskId = visibleEyeHoveredMaskId ?? visibleHoveredMaskId ?? visibleSelectedMaskId;
  const renderedMasks = useMemo(
    () => visibleMasks.filter((mask) => !hiddenMaskIds.includes(mask.id)),
    [hiddenMaskIds, visibleMasks],
  );
  const duplicateName = visibleMasks.some(
    (mask) => mask.name.trim().toLocaleLowerCase() === maskName.trim().toLocaleLowerCase(),
  );
  const hasDraft = draftStrokes.length > 0 || draftColorSelections.length > 0;
  const visibleMaskLookup = useMemo(
    () => new Map(visibleMasks.map((mask) => [mask.id, mask])),
    [visibleMasks],
  );
  const visibleDraftExcludedMaskIds = useMemo(
    () => draftExcludedMaskIds.filter((maskId) => visibleMaskLookup.has(maskId)),
    [draftExcludedMaskIds, visibleMaskLookup],
  );
  const draftExcludedMasks = useMemo(
    () =>
      visibleDraftExcludedMaskIds
        .map((maskId) => visibleMaskLookup.get(maskId))
        .filter((mask): mask is ImageMaskRegion => Boolean(mask)),
    [visibleDraftExcludedMaskIds, visibleMaskLookup],
  );
  const draftSelectionMapPreview = useMemo(() => {
    if (!pixelSource || draftColorSelections.length === 0) return null;
    const selected = new Uint8ClampedArray(pixelSource.width * pixelSource.height);
    const draftExcludedSelections = draftExcludedMasks.map((mask) =>
      selectedPixelsForMask(pixelSource, mask, visibleMaskLookup),
    );
    for (const selection of draftColorSelections) {
      mergeSelectionPixels(
        selected,
        excludeSelectedPixels(colorSelectionPixels(pixelSource, selection), draftExcludedSelections),
      );
    }
    return selectionMapPreviewUrl(pixelSource, selected);
  }, [draftColorSelections, draftExcludedMasks, pixelSource, visibleMaskLookup]);

  useEffect(() => {
    if (!open || !showingMaskImage || !onMasksChange) return;
    if (!masks.some((mask) => !mask.imageKey)) return;
    onMasksChange(
      masks.map((mask) => (mask.imageKey ? mask : { ...mask, imageKey: currentImageKey })),
    );
  }, [currentImageKey, masks, onMasksChange, open, showingMaskImage]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !imageSize) return;
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const orderedMasks = activeMaskId
      ? [
          ...renderedMasks.filter((mask) => mask.id !== activeMaskId),
          ...renderedMasks.filter((mask) => mask.id === activeMaskId),
        ]
      : renderedMasks;

    if (pixelSource) {
      const overlay = context.createImageData(pixelSource.width, pixelSource.height);
      for (const mask of orderedMasks) {
        const color =
          activeMaskId === null
            ? ([250, 204, 21, 112] as const)
            : mask.id === visibleEyeHoveredMaskId
              ? ([6, 182, 212, 245] as const)
              : mask.id === activeMaskId
                ? ([34, 211, 238, 210] as const)
                : ([250, 204, 21, 34] as const);
        if ((mask.colorSelections?.length ?? 0) > 0) {
          const selected = selectedColorPixelsForMask(pixelSource, mask, visibleMaskLookup);
          applySelectionPixels(overlay, selected, color);
        }
      }
      const draftExcludedSelections = draftExcludedMasks.map((mask) =>
        selectedPixelsForMask(pixelSource, mask, visibleMaskLookup),
      );
      for (const selection of draftColorSelections) {
        const selected = excludeSelectedPixels(
          colorSelectionPixels(pixelSource, selection),
          draftExcludedSelections,
        );
        applySelectionPixels(overlay, selected, [59, 130, 246, 148]);
      }
      context.putImageData(overlay, 0, 0);
    }

    for (const mask of orderedMasks) {
      const isActive = mask.id === activeMaskId;
      const isEyeHovered = mask.id === visibleEyeHoveredMaskId;
      const isDimmed = activeMaskId !== null && !isActive;
      for (const stroke of mask.strokes) {
        drawStroke(
          context,
          stroke,
          imageSize.width,
          imageSize.height,
          isEyeHovered
            ? "rgb(6 182 212 / 1)"
            : isActive
            ? "rgb(34 211 238 / 1)"
            : isDimmed
              ? "rgb(250 204 21 / 0.25)"
              : "rgb(250 204 21 / 0.8)",
          isEyeHovered
            ? "rgb(6 182 212 / 0.72)"
            : isActive
            ? "rgb(34 211 238 / 0.55)"
            : isDimmed
              ? "rgb(250 204 21 / 0.08)"
              : "rgb(250 204 21 / 0.3)",
        );
      }
    }
    for (const stroke of draftStrokes) {
      drawStroke(
        context,
        stroke,
        imageSize.width,
        imageSize.height,
        "rgb(59 130 246 / 0.9)",
        "rgb(59 130 246 / 0.35)",
      );
    }
  }, [
    activeMaskId,
    draftColorSelections,
    draftExcludedMasks,
    draftStrokes,
    imageSize,
    pixelSource,
    renderedMasks,
    visibleMaskLookup,
    visibleEyeHoveredMaskId,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const analysisImage = new Image();
    analysisImage.crossOrigin = "anonymous";
    analysisImage.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = analysisImage.naturalWidth;
      canvas.height = analysisImage.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || !canvas.width || !canvas.height) {
        setPixelSource(null);
        setPixelError("This image could not be prepared for color selection.");
        return;
      }
      try {
        context.drawImage(analysisImage, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        setPixelSource({ pixels: imageData.data, width: canvas.width, height: canvas.height });
        setPixelError(null);
      } catch {
        setPixelSource(null);
        setPixelError("Color selection is unavailable because this image blocks pixel access.");
      }
    };
    analysisImage.onerror = () => {
      if (cancelled) return;
      setPixelSource(null);
      setPixelError("Color selection is unavailable because this image blocks pixel access.");
    };
    analysisImage.src = currentItem.src;
    return () => {
      cancelled = true;
    };
  }, [currentItem.src, open]);

  useEffect(() => {
    if (!open) return;
    const image = imageElementRef.current;
    if (!image) return;
    const updateDisplaySize = () => {
      const width = image.offsetWidth;
      const height = image.offsetHeight;
      if (width > 0 && height > 0) setImageDisplaySize({ width, height });
    };
    updateDisplaySize();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateDisplaySize);
    observer?.observe(image);
    window.addEventListener("resize", updateDisplaySize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateDisplaySize);
    };
  }, [currentItem.src, open]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoom((current) => {
        const nextZoom = clampZoom(Number((current + direction * ZOOM_STEP).toFixed(2)));
        if (nextZoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
        return nextZoom;
      });
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isMaskControlTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest("button")) return;
      const target = event.target instanceof Element ? event.target : null;
      const onMaskFrame = Boolean(target?.closest("[data-mask-frame='true']"));
      const canPanInMaskMode =
        maskMode && (!onMaskFrame || maskTool === "pan" || event.altKey || event.button === 1);
      if (zoom <= MIN_ZOOM || (maskMode && !canPanInMaskMode)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: pan,
      };
      setIsPanning(true);
    },
    [maskMode, maskTool, pan, zoom],
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

  const resetMaskDraft = useCallback(() => {
    setMaskMode(false);
    setMaskName("");
    setDraftStrokes([]);
    setDraftColorSelections([]);
    setDraftExcludedMaskIds([]);
    setSampledColor(null);
    setSampledColorLocked(false);
    setPixelError(null);
    drawRef.current = null;
  }, []);

  const showImage = useCallback(
    (index: number) => {
      if (index < 0 || index >= previewItems.length) return;
      setCurrentIndex(index);
      setPixelSource(null);
      setImageSize(null);
      setImageDisplaySize(null);
      resetPreview();
      resetMaskDraft();
    },
    [previewItems.length, resetMaskDraft, resetPreview],
  );

  const pointFromPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = imageElementRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }, []);

  const setSampledPoint = useCallback(
    (point: Point, locked: boolean) => {
      if (!pixelSource) return;
      const sampled = samplePixelColor(pixelSource, point);
      if (!sampled) return;
      setSampledColor(sampled);
      setSampledColorLocked(locked);
    },
    [pixelSource],
  );

  const unlockSampledColor = useCallback(() => {
    setSampledColorLocked(false);
  }, []);

  const nudgeSampledColor = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!pixelSource || !sampledColor) return;
      const currentX = Math.min(
        pixelSource.width - 1,
        Math.max(0, Math.floor(sampledColor.point.x * pixelSource.width)),
      );
      const currentY = Math.min(
        pixelSource.height - 1,
        Math.max(0, Math.floor(sampledColor.point.y * pixelSource.height)),
      );
      const nextX = Math.min(pixelSource.width - 1, Math.max(0, currentX + deltaX));
      const nextY = Math.min(pixelSource.height - 1, Math.max(0, currentY + deltaY));
      setSampledPoint(
        {
          x: (nextX + 0.5) / pixelSource.width,
          y: (nextY + 0.5) / pixelSource.height,
        },
        true,
      );
    },
    [pixelSource, sampledColor, setSampledPoint],
  );

  const handleDrawPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!maskMode) return;
      if (isMaskControlTarget(event.target)) return;
      if (event.altKey || event.button === 1) return;
      if (maskTool === "pan") return;
      const point = pointFromPointer(event);
      if (!point) return;
      event.preventDefault();
      setSampledPoint(point, true);

      if (maskTool === "color") {
        if (!pixelSource) {
          setPixelError("This image is not ready for color selection yet.");
          return;
        }
        setDraftColorSelections([
          {
            id: uid(),
            seed: point,
            tolerance: colorTolerance,
            scope: colorScope,
          },
        ]);
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      const stroke: ImageMaskStroke = {
        id: uid(),
        thickness: strokeThickness,
        points: [point],
        closed: false,
      };
      drawRef.current = { pointerId: event.pointerId, stroke };
      setDraftStrokes((current) => [...current, stroke]);
    },
    [
      colorScope,
      colorTolerance,
      maskMode,
      maskTool,
      pixelSource,
      pointFromPointer,
      setSampledPoint,
      strokeThickness,
    ],
  );

  const handleDrawPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!maskMode || isMaskControlTarget(event.target)) return;
      const point = pointFromPointer(event);
      if (!point) return;
      if (!sampledColorLocked && maskTool !== "pan") setSampledPoint(point, false);

      const draw = drawRef.current;
      if (maskTool !== "pen" || !draw || draw.pointerId !== event.pointerId) return;
      const previous = draw.stroke.points[draw.stroke.points.length - 1];
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015) return;
      draw.stroke = { ...draw.stroke, points: [...draw.stroke.points, point] };
      setDraftStrokes((current) =>
        current.map((stroke) => (stroke.id === draw.stroke.id ? draw.stroke : stroke)),
      );
    },
    [maskMode, maskTool, pointFromPointer, sampledColorLocked, setSampledPoint],
  );

  const stopDrawing = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const draw = drawRef.current;
    if (draw?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const rect = imageFrameRef.current?.getBoundingClientRect();
    const shortestSide = rect ? Math.min(rect.width, rect.height) : 0;
    const threshold = shortestSide > 0 ? Math.max(12, draw.stroke.thickness / 2) / shortestSide : 0;
    const closed = shouldCloseFreehandLoop(draw.stroke.points, threshold);
    if (closed) {
      const closedStroke = { ...draw.stroke, closed: true };
      setDraftStrokes((current) =>
        current.map((stroke) => (stroke.id === closedStroke.id ? closedStroke : stroke)),
      );
    }
    drawRef.current = null;
  }, []);

  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    setImageDisplaySize({ width: image.offsetWidth, height: image.offsetHeight });
  }, []);

  function saveMask() {
    const name = maskName.trim();
    if (!name || duplicateName || !hasDraft || !onMasksChange) return;
    onMasksChange([
      ...masks,
      {
        id: uid(),
        name,
        imageKey: currentImageKey,
        excludedMaskIds: visibleDraftExcludedMaskIds.length
          ? visibleDraftExcludedMaskIds
          : undefined,
        strokes: draftStrokes,
        colorSelections: draftColorSelections,
      },
    ]);
    resetMaskDraft();
  }

  function removeMask(maskId: string) {
    if (!onMasksChange) return;
    onMasksChange(masks.filter((mask) => mask.id !== maskId));
  }

  function clearDraft() {
    setDraftStrokes([]);
    setDraftColorSelections([]);
  }

  function toggleDraftExclusion(maskId: string) {
    setDraftExcludedMaskIds((current) =>
      current.includes(maskId) ? current.filter((id) => id !== maskId) : [...current, maskId],
    );
  }

  function toggleMaskVisibility(maskId: string) {
    setHiddenMaskIds((current) =>
      current.includes(maskId) ? current.filter((id) => id !== maskId) : [...current, maskId],
    );
  }

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (sampledColorLocked && sampledColor && !isMaskControlTarget(event.target)) {
        const nudges: Record<string, Point> = {
          ArrowLeft: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 },
          ArrowUp: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 },
        };
        const nudge = nudges[event.key];
        if (nudge) {
          event.preventDefault();
          nudgeSampledColor(nudge.x, nudge.y);
          return;
        }
      }
      if (event.key === "ArrowLeft" && hasPrevious && !maskMode) {
        event.preventDefault();
        showImage(safeIndex - 1);
      }
      if (event.key === "ArrowRight" && hasNext && !maskMode) {
        event.preventDefault();
        showImage(safeIndex + 1);
      }
    },
    [
      hasNext,
      hasPrevious,
      maskMode,
      nudgeSampledColor,
      safeIndex,
      sampledColor,
      sampledColorLocked,
      showImage,
    ],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setCurrentIndex(initialIndex);
          setPixelSource(null);
          setImageSize(null);
          resetPreview();
          resetMaskDraft();
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent
        showCloseButton={false}
        className="grid h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[1fr_auto] gap-3 overflow-hidden rounded-lg bg-black/90 p-3 ring-white/15 sm:max-w-[calc(100vw-2rem)]"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Enlarged image preview with zoom, pan, freehand masks, and similar-color selection.
        </DialogDescription>
        <div
          className={cn(
            "relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden",
            isPanning
              ? "cursor-grabbing"
              : maskMode
                ? maskTool === "pan"
                  ? zoom > MIN_ZOOM
                    ? "cursor-grab"
                    : "cursor-default"
                  : maskTool === "pen"
                    ? "cursor-crosshair"
                    : "cursor-cell"
              : zoom > MIN_ZOOM
                ? "cursor-grab"
                : "cursor-default",
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPanning}
          onPointerCancel={stopPanning}
        >
          {!maskMode ? (
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
          ) : null}
          <div
            ref={imageFrameRef}
            data-mask-frame="true"
            className="relative inline-block max-h-full max-w-full leading-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageElementRef}
              src={currentItem.src}
              alt={currentItem.alt}
              draggable={false}
              onLoad={handleImageLoad}
              className="block max-h-[calc(100dvh-8rem)] max-w-full object-contain select-none"
            />
            <canvas
              ref={overlayCanvasRef}
              className="pointer-events-none absolute top-0 left-0"
              style={{
                width: imageDisplaySize ? `${imageDisplaySize.width}px` : "100%",
                height: imageDisplaySize ? `${imageDisplaySize.height}px` : "100%",
              }}
              aria-hidden="true"
            />
          </div>
          {canEditMasks ? (
            <div
              data-mask-controls="true"
              className="absolute top-0 left-0 z-30 flex max-h-[calc(100%-1rem)] w-72 max-w-[calc(100%-4rem)] flex-col gap-2 overflow-y-auto rounded-md bg-black/80 p-2.5 text-white shadow-xl ring-1 ring-white/20 backdrop-blur"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onPointerCancel={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={maskMode ? "default" : "secondary"}
                  onClick={() => {
                    setMaskMode((current) => !current);
                    resetPreview();
                  }}
                >
                  {maskMode ? <PenLine /> : <Plus />}
                  {maskMode ? "Editing mask" : "Add mask"}
                </Button>
                {maskMode ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!maskName.trim() || duplicateName || !hasDraft}
                    onClick={saveMask}
                  >
                    <Save />
                    Save
                  </Button>
                ) : null}
              </div>
              {maskMode ? (
                <div className="grid gap-2.5 border-t border-white/15 pt-2.5">
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-white/10 p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={maskTool === "pan" ? "secondary" : "ghost"}
                      className={cn(maskTool !== "pan" && "text-white hover:text-white")}
                      onClick={() => setMaskTool("pan")}
                    >
                      <Move /> Pan
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={maskTool === "pen" ? "secondary" : "ghost"}
                      className={cn(maskTool !== "pen" && "text-white hover:text-white")}
                      onClick={() => setMaskTool("pen")}
                    >
                      <PenLine /> Pen
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={maskTool === "color" ? "secondary" : "ghost"}
                      className={cn(maskTool !== "color" && "text-white hover:text-white")}
                      onClick={() => setMaskTool("color")}
                    >
                      <Pipette /> Similar color
                    </Button>
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor={`${inputId}-name`} className="text-xs text-white/80">
                      Part name
                    </Label>
                    <Input
                      id={`${inputId}-name`}
                      value={maskName}
                      onChange={(event) => setMaskName(event.target.value)}
                      placeholder="collar, sleeve, logo..."
                      aria-invalid={duplicateName}
                      className="h-8 bg-white text-xs text-black"
                    />
                    {duplicateName ? (
                      <p className="text-xs text-red-300">Use a unique mask name.</p>
                    ) : null}
                  </div>

                  {maskTool === "pen" ? (
                    <div className="grid gap-2">
                      <div className="grid grid-cols-[1fr_44px] items-center gap-2">
                        <div className="grid gap-1">
                          <Label htmlFor={`${inputId}-thickness`} className="text-xs text-white/80">
                            Thickness {strokeThickness}px
                          </Label>
                          <input
                            id={`${inputId}-thickness`}
                            type="range"
                            min={MIN_MASK_BRUSH_THICKNESS}
                            max={MAX_MASK_BRUSH_THICKNESS}
                            value={strokeThickness}
                            onChange={(event) =>
                              setStrokeThickness(
                                clampMaskBrushThickness(Number(event.target.value)),
                              )
                            }
                            className="w-full"
                          />
                        </div>
                        <svg
                          viewBox="0 0 160 160"
                          className="size-11 rounded-md bg-white/10 p-1"
                          aria-label={`${strokeThickness} pixel brush preview`}
                        >
                          <circle cx="80" cy="80" r={strokeThickness / 2} fill="rgb(96 165 250)" />
                        </svg>
                      </div>
                      {sampledColor ? (
                        <div className="grid grid-cols-[60px_1fr] items-center gap-2 rounded-md bg-white/10 p-2">
                          {sampledColor.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={sampledColor.thumbnailUrl}
                              alt={`Sampled color thumbnail ${sampledColor.hex}`}
                              className="size-[60px] rounded border border-white/35 object-cover"
                              draggable={false}
                            />
                          ) : (
                            <span
                              className="size-[60px] rounded border border-white/35"
                              style={{ backgroundColor: sampledColor.hex }}
                              aria-label={`Sampled color ${sampledColor.hex}`}
                            />
                          )}
                          <span className="grid min-w-0 gap-0.5 text-xs">
                            <span className="font-mono font-semibold text-white">
                              {sampledColor.hex}
                            </span>
                            <span className="text-white/70">
                              RGB {sampledColor.rgb.join(", ")} · Alpha {sampledColor.alpha}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-white/65">
                          Click the image to sample the color under the pen.
                        </p>
                      )}
                      {sampledColorLocked ? (
                        <Button type="button" size="sm" variant="ghost" onClick={unlockSampledColor}>
                          <Unlock /> Unlock color monitor
                        </Button>
                      ) : null}
                    </div>
                  ) : maskTool === "pan" ? (
                    <p className="rounded-md bg-white/10 p-2 text-xs text-white/70">
                      Drag the zoomed image to pan.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      <div className="grid grid-cols-2 gap-1 rounded-md bg-white/10 p-1">
                        {(["global", "region"] as const).map((scope) => (
                          <Button
                            key={scope}
                            type="button"
                            size="sm"
                            variant={colorScope === scope ? "secondary" : "ghost"}
                            className={cn(
                              "capitalize",
                              colorScope !== scope && "text-white hover:text-white",
                            )}
                            onClick={() => {
                              setColorScope(scope);
                              setDraftColorSelections((current) =>
                                current.map((selection) => ({ ...selection, scope })),
                              );
                            }}
                          >
                            {scope}
                          </Button>
                        ))}
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${inputId}-tolerance`} className="text-xs text-white/80">
                          Similarity tolerance {colorTolerance}
                        </Label>
                        <input
                          id={`${inputId}-tolerance`}
                          type="range"
                          min="0"
                          max="100"
                          value={colorTolerance}
                          onChange={(event) => {
                            const tolerance = Number(event.target.value);
                            setColorTolerance(tolerance);
                            setDraftColorSelections((current) =>
                              current.map((selection) => ({ ...selection, tolerance })),
                            );
                          }}
                          className="w-full"
                        />
                      </div>
                      <p className="text-xs text-white/65">
                        Click a color in the image to preview the selection.
                      </p>
                      <SampledColorPreview
                        sampledColor={sampledColor}
                        locked={sampledColorLocked}
                        emptyText="No color sampled yet."
                        onUnlock={unlockSampledColor}
                      />
                      <SelectionMapPreviewCard preview={draftSelectionMapPreview} />
                      {pixelError ? <p className="text-xs text-red-300">{pixelError}</p> : null}
                    </div>
                  )}

                  {hasDraft ? (
                    <Button type="button" size="sm" variant="ghost" onClick={clearDraft}>
                      <RotateCcw /> Clear draft
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {visibleMasks.length ? (
                <div className="grid gap-1 border-t border-white/15 pt-2">
                  {visibleMasks.map((mask) => {
                    const excluded = draftExcludedMaskIds.includes(mask.id);
                    const hidden = hiddenMaskIds.includes(mask.id);
                    return (
                      <div
                        key={mask.id}
                        className={cn(
                          "flex items-center gap-1 rounded-sm text-xs transition-colors",
                          activeMaskId === mask.id
                            ? "bg-cyan-400/20 text-cyan-100"
                            : excluded
                              ? "bg-red-400/15 text-red-100"
                              : "text-white",
                        )}
                      >
                        <button
                          type="button"
                          aria-pressed={selectedMaskId === mask.id}
                          className="min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
                          onPointerEnter={() => setHoveredMaskId(mask.id)}
                          onPointerLeave={() => setHoveredMaskId(null)}
                          onFocus={() => setHoveredMaskId(mask.id)}
                          onBlur={() => setHoveredMaskId(null)}
                          onClick={() =>
                            setSelectedMaskId((current) => (current === mask.id ? null : mask.id))
                          }
                        >
                          {mask.name}
                        </button>
                        <button
                          type="button"
                          aria-pressed={!hidden}
                          className={cn(
                            "rounded p-1 text-white/70 hover:bg-cyan-300/20 hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300",
                            !hidden && "text-cyan-100",
                            visibleEyeHoveredMaskId === mask.id && "bg-cyan-300/25 text-cyan-50",
                          )}
                          aria-label={`${hidden ? "Show" : "Hide"} ${mask.name} mask`}
                          title={`${hidden ? "Show" : "Hide"} ${mask.name} mask`}
                          onPointerEnter={() => setEyeHoveredMaskId(mask.id)}
                          onPointerLeave={() => setEyeHoveredMaskId(null)}
                          onFocus={() => setEyeHoveredMaskId(mask.id)}
                          onBlur={() => setEyeHoveredMaskId(null)}
                          onClick={() => toggleMaskVisibility(mask.id)}
                        >
                          {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                        <button
                          type="button"
                          aria-pressed={excluded}
                          className={cn(
                            "rounded-sm px-1.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white",
                            excluded && "bg-red-400/25 text-red-100",
                          )}
                          aria-label={`${excluded ? "Stop excluding" : "Exclude"} ${mask.name} from next mask`}
                          onClick={() => toggleDraftExclusion(mask.id)}
                        >
                          Exclude
                        </button>
                        <button
                          type="button"
                          className="mr-1 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                          aria-label={`Delete ${mask.name} mask`}
                          onClick={() => removeMask(mask.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {hasPrevious && !maskMode ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute left-2 z-20 size-11 rounded-full shadow-xl sm:left-4"
              aria-label="Previous rendered image"
              title="Previous rendered image"
              onClick={() => showImage(safeIndex - 1)}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ) : null}
          {hasNext && !maskMode ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-2 z-20 size-11 rounded-full shadow-xl sm:right-4"
              aria-label="Next rendered image"
              title="Next rendered image"
              onClick={() => showImage(safeIndex + 1)}
            >
              <ChevronRight className="size-5" />
            </Button>
          ) : null}
          {previewItems.length > 1 ? (
            <span className="pointer-events-none absolute bottom-0 left-0 rounded-md bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/20">
              {safeIndex + 1} of {previewItems.length}
            </span>
          ) : null}
          {onSelect ? (
            <Button
              type="button"
              variant={currentItemSelected ? "secondary" : "default"}
              className="absolute right-0 bottom-0 z-20 shadow-lg"
              onClick={() => {
                onSelect(currentItem, safeIndex);
                setOpen(false);
              }}
            >
              {currentItemSelected ? selectedLabel : selectLabel}
            </Button>
          ) : null}
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
        {previewItems.length > 1 ? (
          <div className="flex min-h-16 gap-2 overflow-x-auto border-t border-white/15 pt-3">
            {previewItems.map((item, index) => {
              const selected =
                selectedItemId !== null && item.id !== undefined && item.id === selectedItemId;
              return (
                <button
                  key={item.id ?? `${item.src}-${index}`}
                  type="button"
                  className={cn(
                    "relative h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-white/5 transition",
                    index === safeIndex
                      ? "border-white ring-2 ring-white/60"
                      : "border-white/20 hover:border-white/60",
                  )}
                  aria-label={`Show image ${index + 1}`}
                  aria-current={index === safeIndex ? "true" : undefined}
                  onClick={() => showImage(index)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.src} alt="" className="size-full object-cover" />
                  {selected ? (
                    <span className="bg-primary absolute right-1 bottom-1 size-4 rounded-full ring-2 ring-white" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
