import type { Edge, Node } from "@xyflow/react";
import type {
  ImageGenerationModelId,
  ImageGenerationOutputFormat,
  ImageGenerationResolution,
  ImageGenerationSize,
} from "@/lib/image-generation-models";
import type { SupplierProductType } from "@/lib/workspace-records";
import type { PantoneCatalog } from "./pantone";

/** Registered canvas node type identifiers (kept in sync with the registry). */
export const NODE_TYPES = [
  "note",
  "image",
  "group",
  "imageInput",
  "generate",
  "imageOutput",
  "suppler",
  "action",
  "pantone",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

// ── Per-type node data ───────────────────────────────────────────────────
// Each carries an index signature so the type satisfies React Flow v12's
// `Record<string, unknown>` data constraint; declared fields keep their types.
export interface NoteNodeData {
  text: string;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface ImageNodeData {
  url: string | null;
  alt?: string;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface InputNodeData {
  alias: string;
  imageUrl: string | null;
  storagePath?: string | null;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface GroupNodeData {
  label: string;
  /** Accent color shared by the group and its child nodes for identification. */
  color?: string;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface GenerateNodeData {
  prompt: string;
  model: ImageGenerationModelId;
  size?: ImageGenerationSize;
  outputFormat?: ImageGenerationOutputFormat;
  resolution?: ImageGenerationResolution;
  references: string[];
  status: "idle" | "loading" | "error" | "done";
  resultUrl: string | null;
  error?: string;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface OutputNodeData {
  resultUrl: string | null;
  prompt?: string;
  model?: string;
  outputFormat?: ImageGenerationOutputFormat;
  status: "idle" | "loading" | "error" | "done";
  error?: string;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface SupplerNodeData {
  selectedProductType: SupplierProductType | null;
  productTypeQuery: string;
  supplierQuery: string;
  supplierId: string | null;
  supplierName: string | null;
  title?: string;
  notes?: string;
  status?: "draft" | "ready" | "blocked";
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface ActionNodeData {
  title: string;
  notes: string;
  status: "manual" | "queued" | "done";
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface PantoneNodeData {
  query: string;
  code: string | null;
  name: string | null;
  hex: string | null;
  catalog?: PantoneCatalog | null;
  catalogFilter?: PantoneCatalog | null;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

// ── Generic shapes used by the persistence layer ─────────────────────────
export type CanvasNode = Node<Record<string, unknown>, NodeType>;
export type CanvasEdge = Edge;

export interface CanvasContent {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export const EMPTY_CANVAS_CONTENT: CanvasContent = { nodes: [], edges: [] };

// ── Per-type node shapes for typed components ────────────────────────────
export type NoteCanvasNode = Node<NoteNodeData, "note">;
export type ImageCanvasNode = Node<ImageNodeData, "image">;
export type InputCanvasNode = Node<InputNodeData, "imageInput">;
export type GroupCanvasNode = Node<GroupNodeData, "group">;
export type GenerateCanvasNode = Node<GenerateNodeData, "generate">;
export type OutputCanvasNode = Node<OutputNodeData, "imageOutput">;
export type SupplerCanvasNode = Node<SupplerNodeData, "suppler">;
export type ActionCanvasNode = Node<ActionNodeData, "action">;
export type PantoneCanvasNode = Node<PantoneNodeData, "pantone">;
