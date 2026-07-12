"use client";

import type { ImageGenerationOutputFormat } from "@/lib/image-generation-models";

function extensionFromMimeType(mimeType: string | null): string | null {
  if (!mimeType) return null;
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return null;
}

function extensionFromFormat(format: string | null | undefined): string | null {
  if (!format) return null;
  if (format === "jpeg") return "jpg";
  if (format === "png" || format === "webp" || format === "jpg") return format;
  return null;
}

export async function downloadImageFile({
  url,
  baseName,
  outputFormat,
}: {
  url: string;
  baseName: string;
  outputFormat?: ImageGenerationOutputFormat | string | null;
}): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to download this image.");

  const blob = await response.blob();
  const extension =
    extensionFromFormat(outputFormat) ??
    extensionFromMimeType(blob.type) ??
    extensionFromMimeType(response.headers.get("content-type")) ??
    "png";

  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${baseName}.${extension}`;
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
