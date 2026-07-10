import { EMPTY_CANVAS_CONTENT } from "@/lib/nodes/types";

import type {
  Canvas,
  CanvasStore,
  CreateCanvasInput,
  CreateProjectInput,
  ImageRecord,
  Project,
  ProjectUpdate,
  RecordImageInput,
} from "./canvasStore";

/**
 * localStorage-backed CanvasStore. Used in local/demo mode (no Supabase keys).
 * Client-only: every method guards `window` so SSR is a no-op-safe import.
 */

const KEYS = {
  projects: "ica:projects",
  canvases: "ica:canvases",
  images: "ica:images",
} as const;

function isInlineImageUrl(url: string): boolean {
  return url.startsWith("data:image/");
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

const nowISO = () => new Date().toISOString();
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export const localCanvasStore: CanvasStore = {
  // ── Projects ──────────────────────────────────────────────────────────
  async listProjects() {
    const projects = read<Project[]>(KEYS.projects, []);
    return delay(projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  },

  async getProject(id) {
    const projects = read<Project[]>(KEYS.projects, []);
    return delay(projects.find((p) => p.id === id) ?? null);
  },

  async createProject(input: CreateProjectInput) {
    const projects = read<Project[]>(KEYS.projects, []);
    const project: Project = {
      id: uid(),
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    write(KEYS.projects, [project, ...projects]);
    return delay(project);
  },

  async updateProject(id, input: ProjectUpdate) {
    const projects = read<Project[]>(KEYS.projects, []);
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Project not found");
    const updated: Project = {
      ...projects[idx],
      ...("name" in input && input.name !== undefined ? { name: input.name } : {}),
      ...("description" in input && input.description !== undefined
        ? { description: input.description }
        : {}),
      updatedAt: nowISO(),
    };
    projects[idx] = updated;
    write(KEYS.projects, projects);
    return delay(updated);
  },

  async deleteProject(id) {
    const projects = read<Project[]>(KEYS.projects, []);
    write(
      KEYS.projects,
      projects.filter((p) => p.id !== id),
    );
    // Cascade: drop canvases + their images.
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    const remaining = canvases.filter((c) => c.projectId !== id);
    write(KEYS.canvases, remaining);
    const deletedIds = new Set(canvases.filter((c) => c.projectId === id).map((c) => c.id));
    if (deletedIds.size > 0) {
      const images = read<ImageRecord[]>(KEYS.images, []);
      write(
        KEYS.images,
        images.filter((i) => !i.canvasId || !deletedIds.has(i.canvasId)),
      );
    }
  },

  // ── Canvases ──────────────────────────────────────────────────────────
  async listCanvases(projectId) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    return delay(
      canvases
        .filter((c) => c.projectId === projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  },

  async getCanvas(id) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    return delay(canvases.find((c) => c.id === id) ?? null);
  },

  async createCanvas(input: CreateCanvasInput) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    const canvas: Canvas = {
      id: uid(),
      projectId: input.projectId,
      name: input.name.trim(),
      content: EMPTY_CANVAS_CONTENT,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    write(KEYS.canvases, [canvas, ...canvases]);
    return delay(canvas);
  },

  async renameCanvas(id, name) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    const idx = canvases.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("Canvas not found");
    canvases[idx] = { ...canvases[idx], name: name.trim(), updatedAt: nowISO() };
    write(KEYS.canvases, canvases);
    return delay(canvases[idx]);
  },

  async saveCanvasContent(id, content) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    const idx = canvases.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("Canvas not found");
    canvases[idx] = { ...canvases[idx], content, updatedAt: nowISO() };
    write(KEYS.canvases, canvases);
    return delay(undefined);
  },

  async deleteCanvas(id) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    write(
      KEYS.canvases,
      canvases.filter((c) => c.id !== id),
    );
    const images = read<ImageRecord[]>(KEYS.images, []);
    write(
      KEYS.images,
      images.filter((i) => i.canvasId !== id),
    );
    return delay(undefined);
  },

  // ── Image metadata ────────────────────────────────────────────────────
  async recordImage(input: RecordImageInput) {
    const images = read<ImageRecord[]>(KEYS.images, []);
    const record: ImageRecord = {
      id: uid(),
      canvasId: input.canvasId ?? null,
      source: input.source,
      url: input.url,
      storagePath: input.storagePath ?? null,
      prompt: input.prompt ?? null,
      model: input.model ?? null,
      createdAt: nowISO(),
    };

    // Inline images already live in canvas node data. Duplicating their
    // multi-megabyte payloads in image metadata quickly exhausts localStorage.
    const metadataImages = images.filter((image) => !isInlineImageUrl(image.url));
    if (isInlineImageUrl(record.url)) {
      if (metadataImages.length !== images.length) {
        write(KEYS.images, metadataImages);
      }
      return delay(record);
    }

    write(KEYS.images, [record, ...metadataImages]);
    return delay(record);
  },
};
