"use client";

import { isLocalPostgresConfigured, isSupabaseConfigured } from "@/lib/env";
import type { ImageGenerationOutputFormat } from "@/lib/image-generation-models";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface UploadResult {
  url: string;
  storagePath: string | null;
}

const MAX_DIMENSION = 1280;
const QUALITY = 0.85;
const DEFAULT_FORMAT: ImageGenerationOutputFormat = "webp";

function mimeForFormat(format: ImageGenerationOutputFormat): string {
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  return "image/webp";
}

function extensionForFormat(format: ImageGenerationOutputFormat): string {
  if (format === "jpeg") return "jpg";
  return format;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f-${Date.now()}`;
}

/**
 * Decodes the file, scales it down to MAX_DIMENSION on its longest side, and
 * re-encodes using the selected format. Keeps localStorage (demo mode) and
 * Storage uploads small.
 */
async function fileToScaled(
  file: File,
  format: ImageGenerationOutputFormat,
): Promise<{ dataUrl: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const mime = mimeForFormat(format);
  const dataUrl = canvas.toDataURL(mime, QUALITY);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      mime,
      QUALITY,
    );
  });
  return { dataUrl, blob };
}

async function uploadToLocalPostgres(
  blob: Blob,
  format: ImageGenerationOutputFormat,
): Promise<UploadResult> {
  const form = new FormData();
  form.append(
    "file",
    new File([blob], `upload.${extensionForFormat(format)}`, {
      type: mimeForFormat(format),
    }),
  );

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: form,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    url?: string;
    storagePath?: string;
    error?: string;
  };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? "Failed to upload image to local Postgres storage.");
  }
  return { url: payload.url, storagePath: payload.storagePath ?? null };
}

/**
 * Uploads an image and returns a URL + storage path.
 * - Supabase configured: scaled blob -> Storage `uploads/<uid>/<id>.<ext>`, returns public URL.
 * - Local Postgres: scaled blob -> `.data/uploads` via `/api/uploads`.
 * - Browser demo mode: scaled data URL stored directly on the node.
 */
export async function uploadImage(
  file: File,
  format: ImageGenerationOutputFormat = DEFAULT_FORMAT,
): Promise<UploadResult> {
  const { dataUrl, blob } = await fileToScaled(file, format);

  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to upload images.");

    const path = `${user.id}/${uid()}.${extensionForFormat(format)}`;
    const { error } = await supabase.storage
      .from("uploads")
      .upload(path, blob, { contentType: mimeForFormat(format), upsert: false });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from("uploads").getPublicUrl(path);
    return { url: data.publicUrl, storagePath: path };
  }

  if (isLocalPostgresConfigured) {
    return uploadToLocalPostgres(blob, format);
  }

  return { url: dataUrl, storagePath: null };
}

/** Converts a provider result (data URL or remote URL) into durable app storage. */
export async function persistGeneratedImage(
  url: string,
  format: ImageGenerationOutputFormat = DEFAULT_FORMAT,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Failed to read the generated image.");
  const blob = await response.blob();
  signal?.throwIfAborted();
  const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  return uploadImage(
    new File([blob], `generated.${extension}`, { type: blob.type || "image/png" }),
    format,
  );
}
