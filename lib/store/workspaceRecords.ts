import { isSupabaseConfigured } from "@/lib/env";

import { localWorkspaceRecordStore } from "./localWorkspaceRecordStore";
import { createSupabaseWorkspaceRecordStore } from "./supabaseWorkspaceRecordStore";
import type { WorkspaceRecordStore } from "./workspaceRecordStore";

let cached: WorkspaceRecordStore | null = null;

export function getWorkspaceRecordStore(): WorkspaceRecordStore {
  if (cached) return cached;
  cached = isSupabaseConfigured ? createSupabaseWorkspaceRecordStore() : localWorkspaceRecordStore;
  return cached;
}

export type { WorkspaceRecordKind, WorkspaceRecordStore } from "./workspaceRecordStore";
