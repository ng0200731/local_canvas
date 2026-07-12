import { z } from "zod";

import { EMPTY_CANVAS_CONTENT, NODE_TYPES, type CanvasContent } from "@/lib/nodes/types";
import {
  parseCanvasContent,
  parseCanvasEdge,
  parseCanvasNode,
  safeParseCanvasContent,
  xyPositionSchema,
} from "@/lib/nodes/validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
 * Supabase-backed CanvasStore. Uses the browser client; all access is scoped to
 * the signed-in user via Row Level Security (see supabase/migrations/). Canvas
 * contents are fetched from normalized graph tables, with `canvases.content`
 * kept as a compatibility mirror.
 */

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface CanvasRow {
  id: string;
  project_id: string;
  name: string;
  content: unknown;
  created_at: string;
  updated_at: string;
}

interface ImageRow {
  id: string;
  canvas_id: string | null;
  source: "upload" | "generated";
  url: string;
  storage_path: string | null;
  prompt: string | null;
  model: string | null;
  model_details?: {
    model?: string | null;
    size?: string | null;
    resolution?: string | null;
    outputFormat?: string | null;
    output_format?: string | null;
  } | null;
  created_at: string;
}

const projectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const canvasRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  content: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const imageRowSchema = z.object({
  id: z.string(),
  canvas_id: z.string().nullable(),
  source: z.enum(["upload", "generated"]),
  url: z.string(),
  storage_path: z.string().nullable(),
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  model_details: z
    .object({
      model: z.string().nullable().optional(),
      size: z.string().nullable().optional(),
      resolution: z.string().nullable().optional(),
      outputFormat: z.string().nullable().optional(),
      output_format: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  created_at: z.string(),
});

const canvasNodeRowSchema = z.object({
  id: z.string(),
  type: z.enum(NODE_TYPES),
  position: xyPositionSchema,
  data: z.record(z.string(), z.unknown()),
  parent_id: z.string().nullable(),
  raw: z.unknown().nullable(),
  sort_index: z.number().int(),
});

const canvasEdgeRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  source_handle: z.string().nullable(),
  target_handle: z.string().nullable(),
  type: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  raw: z.unknown().nullable(),
  sort_index: z.number().int(),
});

const mapProject = (value: unknown): Project => {
  const r: ProjectRow = projectRowSchema.parse(value);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

const mapCanvas = (value: unknown, content?: CanvasContent): Canvas => {
  const r: CanvasRow = canvasRowSchema.parse(value);
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    content: content ?? safeParseCanvasContent(r.content),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

const mapImage = (value: unknown): ImageRecord => {
  const r: ImageRow = imageRowSchema.parse(value);
  return {
    id: r.id,
    canvasId: r.canvas_id,
    source: r.source,
    url: r.url,
    storagePath: r.storage_path,
    prompt: r.prompt,
    model: r.model,
    modelDetails: r.model_details
      ? {
          model: r.model_details.model ?? r.model ?? "",
          size: r.model_details.size ?? null,
          resolution: r.model_details.resolution ?? null,
          outputFormat: r.model_details.outputFormat ?? r.model_details.output_format ?? null,
        }
      : null,
    createdAt: r.created_at,
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function buildNodeFromRow(value: unknown) {
  const row = canvasNodeRowSchema.parse(value);
  const node: Record<string, unknown> = isRecord(row.raw) ? { ...row.raw } : {};

  node.id = row.id;
  node.type = row.type;
  node.position = row.position;
  node.data = row.data;
  if (row.parent_id) {
    node.parentId = row.parent_id;
  } else {
    delete node.parentId;
  }

  return parseCanvasNode(node);
}

function buildEdgeFromRow(value: unknown) {
  const row = canvasEdgeRowSchema.parse(value);
  const edge: Record<string, unknown> = isRecord(row.raw) ? { ...row.raw } : {};

  edge.id = row.id;
  edge.source = row.source;
  edge.target = row.target;
  edge.data = row.data;
  if (row.type) {
    edge.type = row.type;
  } else {
    delete edge.type;
  }
  if (row.source_handle) {
    edge.sourceHandle = row.source_handle;
  } else {
    delete edge.sourceHandle;
  }
  if (row.target_handle) {
    edge.targetHandle = row.target_handle;
  } else {
    delete edge.targetHandle;
  }

  return parseCanvasEdge(edge);
}

function assertNoError<T extends { error: { message: string } | null }>(
  result: T,
  context: string,
): void {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

export function createSupabaseCanvasStore(): CanvasStore {
  const supabase = getSupabaseBrowserClient();

  async function getCurrentUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    assertNoError({ error }, "getCurrentUser");
    if (!data.user) throw new Error("Sign in before saving to the database.");
    return data.user.id;
  }

  async function loadCanvasContent(
    canvasId: string,
    mirrorContent: unknown,
  ): Promise<CanvasContent> {
    const [{ data: nodeRows, error: nodeError }, { data: edgeRows, error: edgeError }] =
      await Promise.all([
        supabase
          .from("canvas_nodes")
          .select("id, type, position, data, parent_id, raw, sort_index")
          .eq("canvas_id", canvasId)
          .order("sort_index", { ascending: true }),
        supabase
          .from("canvas_edges")
          .select("id, source, target, source_handle, target_handle, type, data, raw, sort_index")
          .eq("canvas_id", canvasId)
          .order("sort_index", { ascending: true }),
      ]);

    assertNoError({ error: nodeError }, "loadCanvasNodes");
    assertNoError({ error: edgeError }, "loadCanvasEdges");

    const nodes = toUnknownArray(nodeRows).map(buildNodeFromRow);
    const edges = toUnknownArray(edgeRows).map(buildEdgeFromRow);
    if (nodes.length > 0 || edges.length > 0) return { nodes, edges };

    return safeParseCanvasContent(mirrorContent);
  }

  return {
    // ── Projects ────────────────────────────────────────────────────────
    async listProjects() {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, created_at, updated_at")
        .order("updated_at", { ascending: false });
      assertNoError({ error }, "listProjects");
      return toUnknownArray(data).map(mapProject);
    },

    async getProject(id) {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      assertNoError({ error }, "getProject");
      return data ? mapProject(data) : null;
    },

    async createProject(input: CreateProjectInput) {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          name: input.name.trim(),
          description: input.description?.trim() ?? null,
        })
        .select("id, name, description, created_at, updated_at")
        .single();
      assertNoError({ error }, "createProject");
      return mapProject(data);
    },

    async updateProject(id, input: ProjectUpdate) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      const { data, error } = await supabase
        .from("projects")
        .update(patch)
        .eq("id", id)
        .select("id, name, description, created_at, updated_at")
        .single();
      assertNoError({ error }, "updateProject");
      return mapProject(data);
    },

    async deleteProject(id) {
      // Canvas/image cascade is handled at the DB level (ON DELETE CASCADE).
      const { error } = await supabase.from("projects").delete().eq("id", id);
      assertNoError({ error }, "deleteProject");
    },

    // ── Canvases ────────────────────────────────────────────────────────
    async listCanvases(projectId) {
      const { data, error } = await supabase
        .from("canvases")
        .select("id, project_id, name, content, created_at, updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      assertNoError({ error }, "listCanvases");
      return toUnknownArray(data).map((row) => mapCanvas(row));
    },

    async getCanvas(id) {
      const { data, error } = await supabase
        .from("canvases")
        .select("id, project_id, name, content, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      assertNoError({ error }, "getCanvas");
      if (!data) return null;
      const row = canvasRowSchema.parse(data);
      const content = await loadCanvasContent(row.id, row.content);
      return mapCanvas(row, content);
    },

    async createCanvas(input: CreateCanvasInput) {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("canvases")
        .insert({
          project_id: input.projectId,
          user_id: userId,
          name: input.name.trim(),
          content: EMPTY_CANVAS_CONTENT,
        })
        .select("id, project_id, name, content, created_at, updated_at")
        .single();
      assertNoError({ error }, "createCanvas");
      return mapCanvas(data);
    },

    async renameCanvas(id, name) {
      const { data, error } = await supabase
        .from("canvases")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, project_id, name, content, created_at, updated_at")
        .single();
      assertNoError({ error }, "renameCanvas");
      return mapCanvas(data);
    },

    async saveCanvasContent(id, content) {
      const validContent = parseCanvasContent(content);
      const { error } = await supabase.rpc("replace_canvas_graph", {
        p_canvas_id: id,
        p_content: validContent,
        p_edges: validContent.edges,
        p_nodes: validContent.nodes,
      });
      assertNoError({ error }, "saveCanvasContent");
    },

    async deleteCanvas(id) {
      const { error } = await supabase.from("canvases").delete().eq("id", id);
      assertNoError({ error }, "deleteCanvas");
    },

    // ── Image metadata ──────────────────────────────────────────────────
    async listImages(canvasId: string) {
      const query = await supabase
        .from("images")
        .select(
          "id, canvas_id, source, url, storage_path, prompt, model, model_details, created_at",
        )
        .eq("canvas_id", canvasId)
        .eq("source", "generated")
        .order("created_at", { ascending: false });
      if (query.error?.message.includes("model_details")) {
        const legacy = await supabase
          .from("images")
          .select("id, canvas_id, source, url, storage_path, prompt, model, created_at")
          .eq("canvas_id", canvasId)
          .eq("source", "generated")
          .order("created_at", { ascending: false });
        assertNoError({ error: legacy.error }, "listImages");
        return z.array(imageRowSchema).parse(legacy.data).map(mapImage);
      }
      assertNoError({ error: query.error }, "listImages");
      return z.array(imageRowSchema).parse(query.data).map(mapImage);
    },

    async recordImage(input: RecordImageInput) {
      const userId = await getCurrentUserId();
      const values = {
        user_id: userId,
        canvas_id: input.canvasId ?? null,
        source: input.source,
        url: input.url,
        storage_path: input.storagePath ?? null,
        prompt: input.prompt ?? null,
        model: input.model ?? null,
        model_details: input.modelDetails
          ? {
              model: input.modelDetails.model,
              size: input.modelDetails.size,
              resolution: input.modelDetails.resolution,
              output_format: input.modelDetails.outputFormat,
            }
          : null,
      };
      const query = await supabase
        .from("images")
        .insert(values)
        .select(
          "id, canvas_id, source, url, storage_path, prompt, model, model_details, created_at",
        )
        .single();
      if (query.error?.message.includes("model_details")) {
        const legacyValues = Object.fromEntries(
          Object.entries(values).filter(([key]) => key !== "model_details"),
        );
        const legacy = await supabase
          .from("images")
          .insert(legacyValues)
          .select("id, canvas_id, source, url, storage_path, prompt, model, created_at")
          .single();
        assertNoError({ error: legacy.error }, "recordImage");
        return mapImage(legacy.data);
      }
      assertNoError({ error: query.error }, "recordImage");
      return mapImage(query.data);
    },
  };
}
