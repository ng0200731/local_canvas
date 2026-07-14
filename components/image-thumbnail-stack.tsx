import { cn } from "@/lib/utils";

interface ThumbnailImage {
  id: string;
  name: string;
  url: string;
}

export function ImageThumbnailStack({
  images,
  className,
  thumbnailClassName,
  remainingClassName,
  maximumVisible = 3,
}: {
  images: readonly ThumbnailImage[];
  className?: string;
  thumbnailClassName?: string;
  remainingClassName?: string;
  maximumVisible?: number;
}) {
  const visibleImages = images.slice(0, maximumVisible);
  const remaining = Math.max(0, images.length - visibleImages.length);

  return (
    <span className={cn("inline-flex min-w-0 items-center", className)} aria-hidden="true">
      {visibleImages.map((image) => (
        <span
          key={image.id}
          className={cn(
            "bg-muted border-background relative -ml-2 grid size-7 shrink-0 place-items-center overflow-hidden rounded-md border shadow-sm first:ml-0",
            thumbnailClassName,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" draggable={false} className="size-full object-contain" />
        </span>
      ))}
      {remaining > 0 ? (
        <span
          className={cn(
            "bg-secondary text-secondary-foreground border-background relative -ml-2 grid size-7 shrink-0 place-items-center rounded-full border text-[0.62rem] font-semibold shadow-sm",
            remainingClassName,
          )}
        >
          +{remaining}
        </span>
      ) : null}
    </span>
  );
}
