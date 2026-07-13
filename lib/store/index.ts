import { isSupabaseConfigured } from "@/lib/env";

import type { CanvasStore } from "./canvasStore";
import { localCanvasStore } from "./localCanvasStore";
import { createSupabaseCanvasStore } from "./supabaseCanvasStore";

let cached: CanvasStore | null = null;

/**
 * Returns the active CanvasStore — Supabase when configured, else localStorage.
 * Memoized so both impls share one instance for the session.
 *
 * Depend only on the `CanvasStore` interface; never import a concrete
 * implementation outside this file.
 */
export function getCanvasStore(): CanvasStore {
  if (cached) return cached;
  cached = isSupabaseConfigured ? createSupabaseCanvasStore() : localCanvasStore;
  return cached;
}

export const usingLocalStore = !isSupabaseConfigured;

export type {
  Canvas,
  CanvasSendRecord,
  CanvasStatus,
  CanvasStore,
  CreateCanvasInput,
  CreateCanvasSendInput,
  CreateProjectInput,
  ImageRecord,
  Project,
  ProjectUpdate,
  RecordImageInput,
  UpdateCanvasSendInput,
} from "./canvasStore";
