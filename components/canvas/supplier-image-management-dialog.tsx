"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactElement,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  Images,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { useSupplierImageMatch } from "@/lib/hooks/use-supplier-image-match";
import {
  getProductImageGalleryItems,
  type ProductImageGalleryItem,
} from "@/lib/product-image-gallery";
import {
  MAX_SUPPLIER_MATCH_CATALOG_IMAGES,
  supplierMatchUploadMetadataSchema,
  type SupplierImageMatchCandidate,
  type SupplierMatchCatalogItem,
  type SupplierMatchQueryImage,
} from "@/lib/supplier-image-match";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";
import {
  getWorkspaceProductTypeLabel,
  isSupplierProductType,
  type ProductRecord,
  type SupplierRecord,
} from "@/lib/workspace-records";

interface SupplierImageManagementDialogProps {
  products: readonly ProductRecord[];
  suppliers: readonly SupplierRecord[];
  isCatalogLoading?: boolean;
  catalogError?: string | null;
  currentSupplierId?: string | null;
  selectedItemId?: string | null;
  trigger: ReactElement;
  onSelect: (item: ProductImageGalleryItem) => void;
}

interface RankedMatch {
  match: SupplierImageMatchCandidate;
  item: ProductImageGalleryItem;
  supplier: SupplierRecord;
}

function SimilarityMeter({ value }: { value: number }) {
  const filledSegments = Math.max(0, Math.min(5, Math.round(value / 20)));
  return (
    <div
      className="flex items-center gap-1"
      aria-label={`${Math.round(value)} percent similarity`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-5 rounded-full",
            index < filledSegments ? "bg-amber-500 dark:bg-amber-400" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function SearchLoading({ imageCount }: { imageCount: number }) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-dashed p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative grid size-20 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <Eye className="size-8" />
        <span className="absolute inset-[-0.45rem] animate-spin rounded-full border border-transparent border-t-amber-500 motion-reduce:animate-none" />
      </div>
      <div className="max-w-md space-y-2">
        <p className="font-heading text-lg font-semibold">Searching this supplier catalog</p>
        <p className="text-muted-foreground text-sm leading-6">
          Embedding your reference and {imageCount} supplier image
          {imageCount === 1 ? "" : "s"}, then ranking by cosine similarity.
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-3 gap-3" aria-hidden="true">
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square [animation-delay:150ms]" />
        <Skeleton className="aspect-square [animation-delay:300ms]" />
      </div>
      <p className="text-muted-foreground text-xs">
        Large catalogs can take a moment. Keep this dialog open while search runs.
      </p>
    </div>
  );
}

function CatalogUnavailable({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div
        className="grid min-h-72 place-items-center rounded-xl border border-dashed"
        role="status"
      >
        <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          Loading supplier catalog…
        </span>
      </div>
    );
  }
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed p-8 text-center">
      <div className="max-w-sm space-y-3">
        {error ? (
          <AlertCircle className="text-destructive mx-auto size-8" />
        ) : (
          <Images className="text-muted-foreground mx-auto size-8" />
        )}
        <p className="font-heading font-semibold">
          {error ? "Supplier catalog unavailable" : "No supplier images yet"}
        </p>
        <p className="text-muted-foreground text-sm leading-6">
          {error ??
            "Add product images to your supplier records first. Image search needs at least one catalog image to compare."}
        </p>
      </div>
    </div>
  );
}

function RankedMatchCard({
  rankedMatch,
  rank,
  selected,
  onApply,
}: {
  rankedMatch: RankedMatch;
  rank: number;
  selected: boolean;
  onApply: () => void;
}) {
  const { item, match, supplier } = rankedMatch;
  return (
    <article
      className={cn(
        "bg-card grid gap-4 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md md:grid-cols-[8rem_minmax(0,1fr)_auto]",
        rank === 1 && "border-amber-500/45 ring-1 ring-amber-500/15",
      )}
    >
      <div className="bg-muted relative aspect-square overflow-hidden rounded-lg border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.variant.image.url}
          alt={item.variant.image.name}
          className="size-full object-contain"
        />
        <span className="absolute top-2 left-2 grid size-7 place-items-center rounded-full bg-black/75 text-xs font-bold text-white ring-1 ring-white/25">
          {rank}
        </span>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {rank === 1 ? (
            <Badge className="bg-amber-500 text-black hover:bg-amber-500">
              <Sparkles /> Best match
            </Badge>
          ) : null}
          <Badge variant="secondary">{supplier.company.companyName}</Badge>
          <Badge variant="outline">{getWorkspaceProductTypeLabel(item.product.productType)}</Badge>
        </div>
        <div>
          <p className="truncate font-semibold">{item.product.subject}</p>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-5">
            Cosine {match.cosine.toFixed(3)} · ranked #{rank} for this supplier
          </p>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-1 text-[0.68rem]">
          <span className="bg-muted rounded-md px-2 py-1">{item.variant.image.name}</span>
          {item.variant.material ? (
            <span className="bg-muted rounded-md px-2 py-1">{item.variant.material}</span>
          ) : null}
          {item.variant.colorNotes ? (
            <span className="bg-muted rounded-md px-2 py-1">{item.variant.colorNotes}</span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-32 flex-row items-center justify-between gap-3 md:flex-col md:items-end">
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {Math.round(match.similarity)}
            <span className="text-muted-foreground text-xs">%</span>
          </p>
          <SimilarityMeter value={match.similarity} />
        </div>
        <Button type="button" variant={rank === 1 ? "default" : "outline"} onClick={onApply}>
          {selected ? <Check /> : <ArrowRight />}
          {selected ? "Selected" : "Use match"}
        </Button>
      </div>
    </article>
  );
}

export function SupplierImageManagementDialog({
  products,
  suppliers,
  isCatalogLoading = false,
  catalogError = null,
  currentSupplierId = null,
  selectedItemId = null,
  trigger,
  onSelect,
}: SupplierImageManagementDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [queryImage, setQueryImage] = useState<SupplierMatchQueryImage | null>(null);
  const matchMutation = useSupplierImageMatch();

  const supplierById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const galleryItems = useMemo(
    () =>
      getProductImageGalleryItems(products).filter(
        (item) =>
          item.product.ownerKind === "supplier" &&
          item.product.supplierId !== null &&
          supplierById.has(item.product.supplierId) &&
          isSupplierProductType(item.product.productType),
      ),
    [products, supplierById],
  );
  const catalog = useMemo<SupplierMatchCatalogItem[]>(
    () =>
      galleryItems.flatMap((item) => {
        const supplierId = item.product.supplierId;
        const supplier = supplierId ? supplierById.get(supplierId) : undefined;
        if (!supplier || !isSupplierProductType(item.product.productType)) return [];
        return [
          {
            catalogItemId: item.id,
            supplierId: supplier.id,
            supplierName: supplier.company.companyName,
            productId: item.product.id,
            productSubject: item.product.subject,
            productType: item.product.productType,
            variantId: item.variant.id,
            imageName: item.variant.image.name,
            imageUrl: item.variant.image.url,
            detail: item.product.detail,
            material: item.variant.material,
            colorNotes: item.variant.colorNotes,
            parameters: item.variant.parameters,
          },
        ];
      }),
    [galleryItems, supplierById],
  );
  const galleryById = useMemo(
    () => new Map(galleryItems.map((item) => [item.id, item])),
    [galleryItems],
  );
  const selectedSupplierName = suppliers[0]?.company.companyName ?? null;
  const catalogLimitError =
    catalog.length > MAX_SUPPLIER_MATCH_CATALOG_IMAGES
      ? `This catalog has ${catalog.length} images. Narrow it to ${MAX_SUPPLIER_MATCH_CATALOG_IMAGES} or fewer before image search.`
      : null;
  const blockingCatalogError = catalogError ?? catalogLimitError;

  const rankedMatches = useMemo<RankedMatch[]>(() => {
    if (!matchMutation.data) return [];
    return matchMutation.data.matches.flatMap((match) => {
      const item = galleryById.get(match.catalogItemId);
      const supplierId = item?.product.supplierId;
      const supplier = supplierId ? supplierById.get(supplierId) : undefined;
      return item && supplier ? [{ match, item, supplier }] : [];
    });
  }, [galleryById, matchMutation.data, supplierById]);

  async function runMatch(nextQueryImage: SupplierMatchQueryImage) {
    setUploadError(null);
    if (!currentSupplierId || isCatalogLoading || blockingCatalogError || catalog.length === 0) {
      setUploadError(
        blockingCatalogError ??
          (!currentSupplierId
            ? "Select a supplier before searching its product images."
            : isCatalogLoading
              ? "Wait for the supplier catalog to finish loading."
              : "Add a supplier product image before searching."),
      );
      return;
    }
    await matchMutation.mutateAsync({
      queryImage: nextQueryImage,
      catalog,
      currentSupplierId,
    });
  }

  async function chooseFile(file: File) {
    if (busy) {
      setUploadError("Wait for the current image search to finish before replacing it.");
      return;
    }
    const metadata = supplierMatchUploadMetadataSchema.safeParse({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    if (!metadata.success) {
      setUploadError(metadata.error.issues[0]?.message ?? "Choose a valid image.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    matchMutation.reset();
    try {
      const uploaded = await uploadImage(file);
      const nextQueryImage = { name: metadata.data.name, url: uploaded.url };
      setQueryImage(nextQueryImage);
      setIsUploading(false);
      await runMatch(nextQueryImage);
    } catch (error) {
      if (!matchMutation.isError) {
        setUploadError(error instanceof Error ? error.message : "Image upload failed.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void chooseFile(file);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const imageFile = imageItem?.getAsFile();
    if (!imageFile) return;
    event.preventDefault();
    void chooseFile(imageFile);
  }

  function applyMatch(rankedMatch: RankedMatch) {
    onSelect(rankedMatch.item);
    setOpen(false);
  }

  const searchError =
    uploadError ?? (matchMutation.error instanceof Error ? matchMutation.error.message : null);
  const busy = isUploading || matchMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent
        className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
        onPaste={handlePaste}
      >
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              variant="outline"
            >
              <Eye /> Image search
            </Badge>
            {catalog.length ? (
              <span className="text-muted-foreground text-xs">
                {catalog.length} image{catalog.length === 1 ? "" : "s"}
                {selectedSupplierName ? ` · ${selectedSupplierName}` : ""}
              </span>
            ) : null}
          </div>
          <DialogTitle className="text-xl">Search similar supplier images</DialogTitle>
          <DialogDescription>
            Upload a reference image. Search only the selected supplier&apos;s product images and
            rank matches from highest to lowest similarity.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 lg:grid-cols-[minmax(19rem,0.34fr)_minmax(0,1fr)]">
          <aside className="bg-muted/25 flex min-h-0 flex-col gap-4 overflow-y-auto border-b p-5 lg:border-r lg:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.18em] uppercase">
                  Reference / 01
                </p>
                <p className="font-heading font-semibold">Target image</p>
              </div>
              {queryImage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  <RefreshCw /> Replace
                </Button>
              ) : null}
            </div>

            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void chooseFile(file);
              }}
            />

            {queryImage ? (
              <div
                className={cn(
                  "bg-card relative overflow-hidden rounded-xl border shadow-sm transition-colors",
                  isDragging && "border-amber-500 ring-2 ring-amber-500/20",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%)] bg-size-[16px_16px] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={queryImage.url}
                    alt={`Uploaded reference: ${queryImage.name}`}
                    className="mx-auto aspect-square max-h-80 w-full rounded-lg object-contain"
                  />
                </div>
                <div className="flex items-center gap-2 border-t px-3 py-2">
                  <Check className="size-4 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {queryImage.name}
                  </span>
                </div>
                {isDragging ? (
                  <div className="absolute inset-0 grid place-items-center bg-amber-500/15 p-4 backdrop-blur-sm">
                    <div className="rounded-lg bg-black/80 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
                      Drop to replace target image
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "bg-card flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-6 text-center transition-colors",
                  isDragging && "border-amber-500 bg-amber-500/5",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="grid size-14 place-items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <Upload className="size-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-heading font-semibold">Drop a product reference</p>
                  <p className="text-muted-foreground text-xs leading-5">
                    JPG, PNG, or WebP · up to 12 MB · or paste with Ctrl/Cmd+V
                  </p>
                </div>
                <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
                  <Upload /> Choose image
                </Button>
              </div>
            )}

            {searchError ? (
              <div
                className="border-destructive/30 bg-destructive/5 text-destructive flex gap-2 rounded-lg border p-3 text-sm"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{searchError}</span>
              </div>
            ) : null}

            {queryImage ? (
              <p className="text-muted-foreground text-center text-xs">
                Drop another image on the preview, or paste with Ctrl/Cmd+V, to replace it.
              </p>
            ) : null}

            {queryImage && !busy ? (
              <Button
                type="button"
                className="w-full"
                disabled={
                  !currentSupplierId || Boolean(blockingCatalogError) || catalog.length === 0
                }
                onClick={() => void runMatch(queryImage)}
              >
                <Eye /> {matchMutation.data ? "Search again" : "Search similar images"}
              </Button>
            ) : null}

            <div className="text-muted-foreground mt-auto flex gap-2 border-t pt-4 text-xs leading-5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                Search is limited to the selected supplier&apos;s images. Features are embedded
                server-side and ranked with cosine similarity (no external LLM analysis).
              </p>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5" aria-busy={busy}>
            {isCatalogLoading || blockingCatalogError || catalog.length === 0 ? (
              <CatalogUnavailable loading={isCatalogLoading} error={blockingCatalogError} />
            ) : busy ? (
              isUploading ? (
                <div className="grid min-h-72 place-items-center" role="status" aria-live="polite">
                  <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
                    <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                    Preparing your reference image…
                  </span>
                </div>
              ) : (
                <SearchLoading imageCount={catalog.length} />
              )
            ) : matchMutation.data && rankedMatches.length ? (
              <>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <Eye className="size-4" />
                    <p className="font-heading text-sm font-semibold">Vector search complete</p>
                  </div>
                  <p className="text-sm leading-6">
                    Compared your reference against {matchMutation.data.searchedCount} image
                    {matchMutation.data.searchedCount === 1 ? "" : "s"} from{" "}
                    {selectedSupplierName ?? "the selected supplier"}. Results are ranked by
                    cosine similarity from highest to lowest.
                  </p>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="font-heading font-semibold">Most similar images</p>
                    <p className="text-muted-foreground text-xs">
                      {matchMutation.data.searchedCount} images searched · ranked highest to lowest
                      similarity
                    </p>
                  </div>
                  <Badge variant="outline">Cosine similarity ranking</Badge>
                </div>

                <div className="grid gap-3">
                  {rankedMatches.map((rankedMatch, index) => (
                    <RankedMatchCard
                      key={rankedMatch.item.id}
                      rankedMatch={rankedMatch}
                      rank={index + 1}
                      selected={selectedItemId === rankedMatch.item.id}
                      onApply={() => applyMatch(rankedMatch)}
                    />
                  ))}
                </div>
              </>
            ) : searchError ? (
              <div className="grid min-h-72 place-items-center rounded-xl border border-dashed p-8 text-center">
                <div className="max-w-md space-y-3">
                  <AlertCircle className="text-destructive mx-auto size-9" />
                  <p className="font-heading font-semibold">Search could not finish</p>
                  <p className="text-muted-foreground text-sm leading-6">{searchError}</p>
                  {queryImage ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void runMatch(queryImage)}
                    >
                      <RefreshCw /> Try again
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid min-h-72 flex-1 place-items-center rounded-xl border border-dashed p-8 text-center">
                <div className="max-w-md space-y-4">
                  <div className="bg-muted mx-auto grid size-16 place-items-center rounded-full">
                    <Eye className="text-muted-foreground size-7" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-heading text-lg font-semibold">
                      Ready to search this supplier
                    </p>
                    <p className="text-muted-foreground text-sm leading-6">
                      Upload one target image on the left. Matches are limited to this supplier&apos;s
                      product images and ranked from highest to lowest similarity.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
