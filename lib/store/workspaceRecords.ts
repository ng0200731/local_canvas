import { isLocalPostgresConfigured, isSupabaseConfigured } from "@/lib/env";

import { localWorkspaceRecordStore } from "./localWorkspaceRecordStore";
import { remotePostgresWorkspaceRecordStore } from "./remotePostgresWorkspaceRecordStore";
import { createSupabaseWorkspaceRecordStore } from "./supabaseWorkspaceRecordStore";
import type { WorkspaceRecordStore } from "./workspaceRecordStore";

let cached: WorkspaceRecordStore | null = null;

export function getWorkspaceRecordStore(): WorkspaceRecordStore {
  if (cached) return cached;
  if (isSupabaseConfigured) {
    cached = createSupabaseWorkspaceRecordStore();
  } else if (isLocalPostgresConfigured) {
    cached = remotePostgresWorkspaceRecordStore;
  } else {
    cached = localWorkspaceRecordStore;
  }
  return cached;
}

export type { WorkspaceRecordKind, WorkspaceRecordStore } from "./workspaceRecordStore";
