import type { CanvasContent } from "@/lib/nodes/types";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Canvas {
  id: string;
  projectId: string;
  name: string;
  content: CanvasContent;
  createdAt: string;
  updatedAt: string;
}

export interface ImageRecord {
  id: string;
  canvasId: string | null;
  source: "upload" | "generated";
  url: string;
  storagePath: string | null;
  prompt: string | null;
  model: string | null;
  modelDetails: ImageModelDetails | null;
  createdAt: string;
}

export interface ImageModelDetails {
  model: string;
  size: string | null;
  resolution: string | null;
  outputFormat: string | null;
  durationMs?: number | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface CreateCanvasInput {
  projectId: string;
  name: string;
}

export interface RecordImageInput {
  canvasId?: string | null;
  source: "upload" | "generated";
  url: string;
  storagePath?: string | null;
  prompt?: string | null;
  model?: string | null;
  modelDetails?: ImageModelDetails | null;
}

export type ProjectUpdate = Partial<Pick<Project, "name" | "description">>;

/**
 * Persistence boundary for projects, canvases, and image records.
 *
 * Implementations:
 *   - Supabase (cloud) — active when Supabase env vars are configured
 *   - localStorage — demo/local mode otherwise
 *
 * Always obtain an instance via `getCanvasStore()` in `lib/store/index.ts`; never
 * import a concrete implementation directly, so the backend can swap by env.
 */
export interface CanvasStore {
  // ── Projects ──────────────────────────────────────────────────────────
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: ProjectUpdate): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // ── Canvases ──────────────────────────────────────────────────────────
  listCanvases(projectId: string): Promise<Canvas[]>;
  getCanvas(id: string): Promise<Canvas | null>;
  createCanvas(input: CreateCanvasInput): Promise<Canvas>;
  renameCanvas(id: string, name: string): Promise<Canvas>;
  saveCanvasContent(id: string, content: CanvasContent): Promise<void>;
  deleteCanvas(id: string): Promise<void>;

  // ── Image metadata ────────────────────────────────────────────────────
  listImages(canvasId: string): Promise<ImageRecord[]>;
  recordImage(input: RecordImageInput): Promise<ImageRecord>;
}
