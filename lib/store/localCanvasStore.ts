import { EMPTY_CANVAS_CONTENT, type CanvasContent } from "@/lib/nodes/types";

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

const DB_NAME = "ica:local-store";
const DB_VERSION = 1;
const CANVAS_CONTENT_STORE = "canvasContent";

function isInlineImageUrl(url: string): boolean {
  return url.startsWith("data:image/");
}

function isCanvasContent(value: unknown): value is CanvasContent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openLocalDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error("Browser storage is not available"));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANVAS_CONTENT_STORE)) {
        db.createObjectStore(CANVAS_CONTENT_STORE);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open browser storage"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readCanvasContentFromIndexedDb(id: string): Promise<CanvasContent | null> {
  if (!canUseIndexedDb()) return null;

  const db = await openLocalDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(CANVAS_CONTENT_STORE, "readonly");
      const request = transaction.objectStore(CANVAS_CONTENT_STORE).get(id);
      request.onerror = () => reject(request.error ?? new Error("Failed to read canvas content"));
      request.onsuccess = () => {
        const result: unknown = request.result;
        resolve(isCanvasContent(result) ? result : null);
      };
    });
  } finally {
    db.close();
  }
}

async function writeCanvasContentToIndexedDb(id: string, content: CanvasContent): Promise<void> {
  const db = await openLocalDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CANVAS_CONTENT_STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to save canvas content"));
      transaction.objectStore(CANVAS_CONTENT_STORE).put(content, id);
    });
  } finally {
    db.close();
  }
}

async function deleteCanvasContentFromIndexedDb(id: string): Promise<void> {
  if (!canUseIndexedDb()) return;

  const db = await openLocalDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CANVAS_CONTENT_STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to delete canvas content"));
      transaction.objectStore(CANVAS_CONTENT_STORE).delete(id);
    });
  } finally {
    db.close();
  }
}

async function hydrateCanvasContent(canvas: Canvas): Promise<Canvas> {
  const offloadedContent = await readCanvasContentFromIndexedDb(canvas.id);
  return offloadedContent ? { ...canvas, content: offloadedContent } : canvas;
}

function withoutInlineContent(canvas: Canvas): Canvas {
  return { ...canvas, content: EMPTY_CANVAS_CONTENT };
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
    await Promise.all(
      [...deletedIds].map((canvasId) => deleteCanvasContentFromIndexedDb(canvasId)),
    );
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
    const filtered = canvases
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return Promise.all(filtered.map((canvas) => hydrateCanvasContent(canvas)));
  },

  async getCanvas(id) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    const canvas = canvases.find((c) => c.id === id) ?? null;
    return canvas ? hydrateCanvasContent(canvas) : delay(null);
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
    try {
      write(KEYS.canvases, canvases);
      await deleteCanvasContentFromIndexedDb(id);
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;

      await writeCanvasContentToIndexedDb(id, content);
      canvases[idx] = withoutInlineContent(canvases[idx]);
      try {
        write(KEYS.canvases, canvases);
      } catch (metadataError) {
        throw new Error(
          isQuotaExceededError(metadataError)
            ? "Canvas is too large for local browser storage. Delete unused local canvases or enable Supabase persistence."
            : "Failed to save canvas metadata.",
        );
      }
    }
    return delay(undefined);
  },

  async deleteCanvas(id) {
    const canvases = read<Canvas[]>(KEYS.canvases, []);
    write(
      KEYS.canvases,
      canvases.filter((c) => c.id !== id),
    );
    await deleteCanvasContentFromIndexedDb(id);
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
