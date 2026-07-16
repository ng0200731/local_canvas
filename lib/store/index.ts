import { isLocalPostgresConfigured, isSupabaseConfigured } from "@/lib/env";

import type { CanvasStore } from "./canvasStore";
import { localCanvasStore } from "./localCanvasStore";
import { remotePostgresCanvasStore } from "./remotePostgresCanvasStore";
import { createSupabaseCanvasStore } from "./supabaseCanvasStore";

let cached: CanvasStore | null = null;

/**
 * Returns the active CanvasStore:
 *   - Supabase when configured
 *   - Local Postgres (via API proxy) when NEXT_PUBLIC_LOCAL_POSTGRES is set
 *   - Browser localStorage otherwise
 *
 * Memoized so both impls share one instance for the session.
 *
 * Depend only on the `CanvasStore` interface; never import a concrete
 * implementation outside this file.
 */
export function getCanvasStore(): CanvasStore {
  if (cached) return cached;
  if (isSupabaseConfigured) {
    cached = createSupabaseCanvasStore();
  } else if (isLocalPostgresConfigured) {
    cached = remotePostgresCanvasStore;
  } else {
    cached = localCanvasStore;
  }
  return cached;
}

/** True when using pure browser storage (not Supabase and not local Postgres). */
export const usingLocalStore = !isSupabaseConfigured && !isLocalPostgresConfigured;

/** True when using Docker Postgres on this machine. */
export const usingLocalPostgres = isLocalPostgresConfigured && !isSupabaseConfigured;

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
export type {
  RotateSampleOrderTokenInput,
  SampleOrder,
  SampleOrderUpdate,
  UpdateSampleOrderEmailInput,
  UpsertSampleOrderInput,
} from "@/lib/sample-orders";
