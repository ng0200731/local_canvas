"use client";

import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface UploadResult {
  url: string;
  storagePath: string | null;
}

const MAX_DIMENSION = 1280;
const MIME = "image/webp";
const QUALITY = 0.85;

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f-${Date.now()}`;
}

/**
 * Decodes the file, scales it down to MAX_DIMENSION on its longest side, and
 * re-encodes as webp. Keeps localStorage (demo mode) and Storage uploads small.
 */
async function fileToScaled(file: File): Promise<{ dataUrl: string; blob: Blob }> {
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

  const dataUrl = canvas.toDataURL(MIME, QUALITY);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      MIME,
      QUALITY,
    );
  });
  return { dataUrl, blob };
}

/**
 * Uploads an image and returns a URL + storage path.
 * - Supabase configured: scaled blob → Storage `uploads/<uid>/<id>.webp`, returns public URL.
 * - Local/demo mode: scaled data URL stored directly on the node.
 */
export async function uploadImage(file: File): Promise<UploadResult> {
  const { dataUrl, blob } = await fileToScaled(file);

  if (!isSupabaseConfigured) {
    return { url: dataUrl, storagePath: null };
  }

  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload images.");

  const path = `${user.id}/${uid()}.webp`;
  const { error } = await supabase.storage
    .from("uploads")
    .upload(path, blob, { contentType: MIME, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("uploads").getPublicUrl(path);
  return { url: data.publicUrl, storagePath: path };
}

/** Converts a provider result (data URL or remote URL) into durable app storage. */
export async function persistGeneratedImage(url: string): Promise<UploadResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to read the generated image.");
  const blob = await response.blob();
  const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  return uploadImage(new File([blob], `generated.${extension}`, { type: blob.type || "image/png" }));
}
