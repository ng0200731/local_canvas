"use client";

import type {
  Canvas,
  CanvasSendRecord,
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
import type {
  RotateSampleOrderTokenInput,
  SampleOrder,
  UpdateSampleOrderEmailInput,
  UpsertSampleOrderInput,
} from "@/lib/sample-orders";
import type { CanvasContent } from "@/lib/nodes/types";
import type { CanvasStatus } from "./canvasStore";

async function callLocalCanvasStore<T>(method: string, args: unknown[] = []): Promise<T> {
  const response = await fetch("/api/local-store/canvas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, args }),
  });

  let payload: { result?: T; error?: string } = {};
  try {
    payload = (await response.json()) as { result?: T; error?: string };
  } catch {
    // ignore parse errors; fall through to status text
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Local Postgres request failed (${response.status}).`);
  }
  return payload.result as T;
}

/**
 * Browser-side CanvasStore that proxies every method to the local Postgres API.
 * Used when NEXT_PUBLIC_LOCAL_POSTGRES is set and Supabase is not configured.
 */
export const remotePostgresCanvasStore: CanvasStore = {
  listProjects: () => callLocalCanvasStore<Project[]>("listProjects"),
  getProject: (id: string) => callLocalCanvasStore<Project | null>("getProject", [id]),
  createProject: (input: CreateProjectInput) =>
    callLocalCanvasStore<Project>("createProject", [input]),
  updateProject: (id: string, input: ProjectUpdate) =>
    callLocalCanvasStore<Project>("updateProject", [id, input]),
  deleteProject: (id: string) => callLocalCanvasStore<void>("deleteProject", [id]),

  listCanvases: (projectId: string) => callLocalCanvasStore<Canvas[]>("listCanvases", [projectId]),
  getCanvas: (id: string) => callLocalCanvasStore<Canvas | null>("getCanvas", [id]),
  createCanvas: (input: CreateCanvasInput) => callLocalCanvasStore<Canvas>("createCanvas", [input]),
  renameCanvas: (id: string, name: string) =>
    callLocalCanvasStore<Canvas>("renameCanvas", [id, name]),
  saveCanvasContent: (id: string, content: CanvasContent) =>
    callLocalCanvasStore<void>("saveCanvasContent", [id, content]),
  updateCanvasStatus: (id: string, status: CanvasStatus) =>
    callLocalCanvasStore<Canvas>("updateCanvasStatus", [id, status]),
  deleteCanvas: (id: string) => callLocalCanvasStore<void>("deleteCanvas", [id]),

  listCanvasSends: (canvasId: string) =>
    callLocalCanvasStore<CanvasSendRecord[]>("listCanvasSends", [canvasId]),
  createCanvasSend: (input: CreateCanvasSendInput) =>
    callLocalCanvasStore<CanvasSendRecord>("createCanvasSend", [input]),
  updateCanvasSend: (id: string, input: UpdateCanvasSendInput) =>
    callLocalCanvasStore<CanvasSendRecord>("updateCanvasSend", [id, input]),

  listSampleOrders: () => callLocalCanvasStore<SampleOrder[]>("listSampleOrders"),
  upsertSampleOrder: (input: UpsertSampleOrderInput) =>
    callLocalCanvasStore<SampleOrder>("upsertSampleOrder", [input]),
  updateSampleOrderEmail: (id: string, input: UpdateSampleOrderEmailInput) =>
    callLocalCanvasStore<SampleOrder>("updateSampleOrderEmail", [id, input]),
  rotateSampleOrderToken: (id: string, input: RotateSampleOrderTokenInput) =>
    callLocalCanvasStore<SampleOrder>("rotateSampleOrderToken", [id, input]),
  generateDemoSampleOrders: (count: number) =>
    callLocalCanvasStore<SampleOrder[]>("generateDemoSampleOrders", [count]),

  listImages: (canvasId: string) => callLocalCanvasStore<ImageRecord[]>("listImages", [canvasId]),
  recordImage: (input: RecordImageInput) =>
    callLocalCanvasStore<ImageRecord>("recordImage", [input]),
};
