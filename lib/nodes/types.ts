import type { Edge, Node } from "@xyflow/react";
import type {
  ImageGenerationModelId,
  ImageGenerationOutputFormat,
  ImageGenerationResolution,
  ImageGenerationSize,
} from "@/lib/image-generation-models";
import type { SupplierProductType } from "@/lib/workspace-records";
import type { GenericNodeImage } from "@/lib/workspace-settings";
import type { PantoneCatalog } from "./pantone";

export interface ImageMaskStrokePoint {
  x: number;
  y: number;
}

export interface ImageMaskStroke {
  id: string;
  thickness: number;
  points: ImageMaskStrokePoint[];
  closed?: boolean;
}

export type ImageMaskColorScope = "global" | "region";

export interface ImageMaskColorSelection {
  id: string;
  seed: ImageMaskStrokePoint;
  tolerance: number;
  scope: ImageMaskColorScope;
}

export interface ImageMaskRegion {
  id: string;
  name: string;
  imageKey?: string;
  excludedMaskIds?: string[];
  strokes: ImageMaskStroke[];
  colorSelections?: ImageMaskColorSelection[];
}

export const GENERATE_CHANGE_TYPES = ["texture", "color", "density", "object", "other"] as const;
export type GenerateChangeType = (typeof GENERATE_CHANGE_TYPES)[number];

export interface GeneratePromptRow {
  id: string;
  sourceNodeId: string;
  maskId: string;
  changeType: GenerateChangeType;
  targetText: string;
}

/** Registered canvas node type identifiers (kept in sync with the registry). */
export const NODE_TYPES = [
  "note",
  "image",
  "group",
  "imageInput",
  "generate",
  "imageOutput",
  "suppler",
  "product",
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
  imageMasks?: ImageMaskRegion[];
  genericDefinitionId?: string;
  genericDefinitionName?: string;
  /** Definition images are snapshotted when the node is created. */
  genericImages?: GenericNodeImage[];
  selectedGenericImageId?: string | null;
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
  promptRows?: GeneratePromptRow[];
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
  generationDurationMs?: number;
  createdAt?: string;
  status: "idle" | "loading" | "error" | "done";
  error?: string;
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface SupplerNodeData {
  alias: string;
  selectedProductType: SupplierProductType | null;
  productTypeQuery: string;
  supplierQuery: string;
  supplierId: string | null;
  supplierName: string | null;
  productId: string | null;
  productSubject: string | null;
  variantId: string | null;
  variantImageUrl: string | null;
  variantImageName: string | null;
  imageMasks?: ImageMaskRegion[];
  title?: string;
  notes?: string;
  status?: "draft" | "ready" | "blocked";
  /** Node size in pixels; set by the resize handle. Absent = type default. */
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface ProductNodeData {
  alias: string;
  customerQuery: string;
  customerId: string | null;
  customerName: string | null;
  productId: string | null;
  productSubject: string | null;
  variantId: string | null;
  variantImageUrl: string | null;
  variantImageName: string | null;
  imageMasks?: ImageMaskRegion[];
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
  alias: string;
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
export type ProductCanvasNode = Node<ProductNodeData, "product">;
export type ActionCanvasNode = Node<ActionNodeData, "action">;
export type PantoneCanvasNode = Node<PantoneNodeData, "pantone">;
