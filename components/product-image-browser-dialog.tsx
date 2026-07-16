"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  ImageIcon,
  Mouse,
  Move,
  Search,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  filterProductImageGalleryItems,
  getProductImageGalleryItems,
  type ProductImageGalleryItem,
} from "@/lib/product-image-gallery";
import { getWorkspaceProductTypeLabel, type ProductRecord } from "@/lib/workspace-records";
import { cn } from "@/lib/utils";

interface ProductImageBrowserDialogProps {
  products: readonly ProductRecord[];
  title: string;
  description?: string;
  trigger: ReactElement;
  selectedItemId?: string | null;
  onSelect?: (item: ProductImageGalleryItem) => void;
  onDeleteItems?: (items: readonly ProductImageGalleryItem[]) => void | Promise<void>;
}

interface Point {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  start: Point;
  origin: Point;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;
const INITIAL_VISIBLE_IMAGE_COUNT = 18;
const SHOW_MORE_IMAGE_COUNT = 18;

function highlightMatch(text: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;
  const index = text.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-yellow-300 px-0.5 text-black">
        {text.slice(index, index + normalizedQuery.length)}
      </mark>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function ZoomableProductImage({ item }: { item: ProductImageGalleryItem }) {
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
    if (drag?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  return (
    <div
      className={cn(
        "bg-muted relative flex h-full min-h-[20rem] touch-none items-center justify-center overflow-hidden rounded-md border",
        zoom > MIN_ZOOM ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
      )}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.variant.image.url}
        alt={`${item.product.subject} variant ${item.variantIndex + 1}`}
        draggable={false}
        className="h-full w-full object-contain transition-transform duration-100 ease-out select-none"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      />
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-black/75 px-3 py-2 text-xs font-medium text-white shadow-xl ring-1 ring-white/20">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Mouse className="size-3.5" />
          Scroll to zoom
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Move className="size-3.5" />
          Drag to pan
        </span>
        <span className="whitespace-nowrap text-white/70">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}

function ProductDetails({
  item,
  selected,
  onSelect,
}: {
  item: ProductImageGalleryItem;
  selected: boolean;
  onSelect?: (item: ProductImageGalleryItem) => void;
}) {
  return (
    <aside className="bg-card flex min-h-0 flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">{getWorkspaceProductTypeLabel(item.product.productType)}</Badge>
        <Badge variant="outline">Variant {item.variantIndex + 1}</Badge>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Internal code</p>
        <p className="font-medium">{item.product.subject}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Details</p>
        <p className="text-sm leading-5">{item.product.detail}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Material</p>
          <p>{item.variant.material || "Unknown"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Color</p>
          <p>{item.variant.colorNotes || "Unknown"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Price</p>
          <p>
            {item.variant.unitPrice} {item.variant.priceUnit}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Image</p>
          <p className="truncate">{item.variant.image.name}</p>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto rounded-md border p-2">
        <p className="text-muted-foreground mb-2 text-xs font-medium">Parameters</p>
        <div className="grid gap-1 text-xs">
          {Object.entries(item.variant.parameters).length ? (
            Object.entries(item.variant.parameters).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[6rem_1fr] gap-2">
                <span className="text-muted-foreground">{key}</span>
                <span>{value || "-"}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No parameters saved.</p>
          )}
        </div>
      </div>
      {onSelect ? (
        <Button type="button" className="mt-auto" onClick={() => onSelect(item)}>
          {selected ? <Check /> : <ImageIcon />}
          {selected ? "Selected" : "Select image"}
        </Button>
      ) : null}
    </aside>
  );
}

function ProductHoverDetails({ item, query }: { item: ProductImageGalleryItem; query: string }) {
  return (
    <div className="pointer-events-none absolute right-2 bottom-2 left-2 z-20 translate-y-1 rounded-md bg-black/82 p-2 text-[0.68rem] leading-4 text-white opacity-0 shadow-xl ring-1 ring-white/15 transition group-hover:translate-y-0 group-hover:opacity-100">
      <p className="truncate font-semibold">{highlightMatch(item.product.subject, query)}</p>
      <p className="line-clamp-2 text-white/80">{highlightMatch(item.product.detail, query)}</p>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-white/75">
        <span className="truncate">
          Material: {highlightMatch(item.variant.material || "-", query)}
        </span>
        <span className="truncate">
          Color: {highlightMatch(item.variant.colorNotes || "-", query)}
        </span>
        <span className="truncate">
          Price: {item.variant.unitPrice} {item.variant.priceUnit}
        </span>
        <span className="truncate">Image: {highlightMatch(item.variant.image.name, query)}</span>
      </div>
    </div>
  );
}

export function ProductImageBrowserDialog({
  products,
  title,
  description,
  trigger,
  selectedItemId = null,
  onSelect,
  onDeleteItems,
}: ProductImageBrowserDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const allItems = useMemo(() => getProductImageGalleryItems(products), [products]);
  const filteredItems = useMemo(
    () => filterProductImageGalleryItems(allItems, query),
    [allItems, query],
  );
  const [activeItemId, setActiveItemId] = useState<string | null>(selectedItemId);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_IMAGE_COUNT);
  const preferredActiveItemId = activeItemId ?? selectedItemId;
  const activeItem =
    filteredItems.find((item) => item.id === preferredActiveItemId) ??
    allItems.find((item) => item.id === selectedItemId) ??
    filteredItems[0] ??
    null;
  const previewItem =
    filteredItems.find((item) => item.id === previewItemId) ??
    allItems.find((item) => item.id === previewItemId) ??
    null;
  const previewIndex = previewItem
    ? filteredItems.findIndex((item) => item.id === previewItem.id)
    : -1;
  const hasPrevious = previewIndex > 0;
  const hasNext = previewIndex >= 0 && previewIndex < filteredItems.length - 1;
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasHiddenItems = visibleCount < filteredItems.length;
  const selectedItems = useMemo(
    () => allItems.filter((item) => selectedItemIds.includes(item.id)),
    [allItems, selectedItemIds],
  );
  const hasDeleteActions = onDeleteItems !== undefined;
  const selectedDeleteLabel =
    selectedItems.length === 1 ? "Delete image" : `Delete ${selectedItems.length} images`;

  function handleSelect(item: ProductImageGalleryItem) {
    onSelect?.(item);
    setOpen(false);
    setPreviewItemId(null);
  }

  function toggleSelectedItem(itemId: string) {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }

  async function deleteItems(items: readonly ProductImageGalleryItem[]) {
    if (!onDeleteItems || items.length === 0) return;
    setIsDeleting(true);
    try {
      await onDeleteItems(items);
      const deletedIds = new Set(items.map((item) => item.id));
      setSelectedItemIds((current) => current.filter((id) => !deletedIds.has(id)));
      if (previewItemId && deletedIds.has(previewItemId)) {
        setPreviewItemId(null);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setPreviewItemId(null);
          setVisibleCount(INITIAL_VISIBLE_IMAGE_COUNT);
          setSelectedItemIds([]);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              `${filteredItems.length} matching image${filteredItems.length === 1 ? "" : "s"}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 p-5">
          {previewItem ? (
            <div className="grid min-h-0 gap-4 lg:grid-cols-[7fr_3fr]">
              <div className="relative h-full min-h-0">
                <ZoomableProductImage key={previewItem.id} item={previewItem} />
                {hasPrevious ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute top-1/2 left-3 z-20 size-11 -translate-y-1/2 rounded-full shadow-xl"
                    aria-label="Previous product image"
                    title="Previous product image"
                    onClick={() => setPreviewItemId(filteredItems[previewIndex - 1]?.id ?? null)}
                  >
                    <ChevronLeft className="size-5" />
                  </Button>
                ) : null}
                {hasNext ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute top-1/2 right-3 z-20 size-11 -translate-y-1/2 rounded-full shadow-xl"
                    aria-label="Next product image"
                    title="Next product image"
                    onClick={() => setPreviewItemId(filteredItems[previewIndex + 1]?.id ?? null)}
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                ) : null}
              </div>
              <ProductDetails
                item={previewItem}
                selected={selectedItemId === previewItem.id}
                onSelect={onSelect ? handleSelect : undefined}
              />
            </div>
          ) : (
            <>
              <div className="relative max-w-xl">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search internal code, details, material, color, parameters..."
                  aria-label="Search product images"
                />
              </div>
              {activeItem ? (
                <div className="grid min-h-0 gap-3">
                  {hasDeleteActions ? (
                    <div className="bg-muted/35 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <p className="text-muted-foreground text-xs">
                        {selectedItems.length > 0
                          ? `${selectedItems.length} selected`
                          : "Select images to delete"}
                      </p>
                      {selectedItems.length > 0 ? (
                        <ConfirmDialog
                          title="Delete selected images?"
                          description={`Delete ${selectedItems.length} image${
                            selectedItems.length === 1 ? "" : "s"
                          } from their products? This cannot be undone.`}
                          confirmLabel={selectedDeleteLabel}
                          onConfirm={() => deleteItems(selectedItems)}
                          trigger={
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isDeleting}
                            >
                              <Trash2 />
                              Delete selected ({selectedItems.length})
                            </Button>
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid max-h-[calc(100dvh-17rem)] min-h-0 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {visibleItems.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "bg-muted group relative overflow-hidden rounded-md border text-left",
                          (selectedItemId === item.id || selectedItemIds.includes(item.id)) &&
                            "ring-primary ring-2",
                        )}
                      >
                        <button
                          type="button"
                          className="focus-visible:ring-ring block w-full text-left outline-none focus-visible:ring-2"
                          onClick={() => {
                            setActiveItemId(item.id);
                            setPreviewItemId(item.id);
                          }}
                        >
                          <span className="bg-background flex aspect-[5/2] w-full items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.variant.image.url}
                              alt={`${item.product.subject} variant ${item.variantIndex + 1}`}
                              className="max-h-full max-w-full object-contain p-1 transition-transform group-hover:scale-[1.03]"
                            />
                          </span>
                          <ProductHoverDetails item={item} query={query} />
                        </button>
                        {hasDeleteActions ? (
                          <>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant={selectedItemIds.includes(item.id) ? "default" : "secondary"}
                              className="absolute top-2 left-2 z-20 shadow-md"
                              aria-label={
                                selectedItemIds.includes(item.id)
                                  ? "Deselect image"
                                  : "Select image for deletion"
                              }
                              title={
                                selectedItemIds.includes(item.id)
                                  ? "Deselect image"
                                  : "Select image for deletion"
                              }
                              disabled={isDeleting}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSelectedItem(item.id);
                              }}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <ConfirmDialog
                              title="Delete image?"
                              description={`Delete ${
                                item.product.subject
                              } image variant ${item.variantIndex + 1}? This cannot be undone.`}
                              confirmLabel="Delete image"
                              onConfirm={() => deleteItems([item])}
                              trigger={
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="destructive"
                                  className="absolute top-2 right-2 z-20 shadow-md"
                                  disabled={isDeleting}
                                  aria-label="Delete image"
                                  title="Delete image"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Trash2 />
                                </Button>
                              }
                            />
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {hasHiddenItems ? (
                    <div className="flex flex-wrap items-center justify-center gap-2 border-t pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setVisibleCount((current) =>
                            Math.min(filteredItems.length, current + SHOW_MORE_IMAGE_COUNT),
                          )
                        }
                      >
                        Show more
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Show all ${filteredItems.length} images? This may take time.`,
                          );
                          if (confirmed) setVisibleCount(filteredItems.length);
                        }}
                      >
                        Show all {filteredItems.length} images
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-muted-foreground flex h-80 flex-col items-center justify-center gap-3 text-center text-sm">
                  <ImageIcon className="size-8" />
                  <p>
                    {allItems.length
                      ? "No product images match the search."
                      : "No product images yet."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
