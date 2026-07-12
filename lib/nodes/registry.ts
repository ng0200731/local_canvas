import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_GENERATION_OUTPUT_FORMAT,
  DEFAULT_IMAGE_GENERATION_RESOLUTION,
  DEFAULT_IMAGE_GENERATION_SIZE,
} from "@/lib/image-generation-models";
import type { CanvasNode, NodeType } from "./types";

export interface NodeMeta {
  type: NodeType;
  label: string;
  description: string;
  /** Shown in the palette. `generate` is enabled in M7. */
  palette: boolean;
  defaultData: () => Record<string, unknown>;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Distinct accent colors cycled through so each group (and its children) is easy to tell apart. */
const GROUP_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

function pickGroupColor(): string {
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  note: {
    type: "note",
    label: "Note",
    description: "A text note",
    palette: false,
    defaultData: () => ({ text: "" }),
  },
  image: {
    type: "image",
    label: "Image",
    description: "Display an image",
    palette: false,
    defaultData: () => ({ url: null }),
  },
  imageInput: {
    type: "imageInput",
    label: "Input",
    description: "Named image input",
    palette: true,
    defaultData: () => ({
      alias: "image",
      imageUrl: null,
      storagePath: null,
    }),
  },
  group: {
    type: "group",
    label: "Group",
    description: "A grouping box",
    palette: false,
    defaultData: () => ({ label: "Group", color: pickGroupColor() }),
  },
  generate: {
    type: "generate",
    label: "Generate",
    description: "AI image generation",
    palette: true,
    defaultData: () => ({
      prompt: "",
      model: DEFAULT_IMAGE_GENERATION_MODEL,
      size: DEFAULT_IMAGE_GENERATION_SIZE,
      outputFormat: DEFAULT_IMAGE_GENERATION_OUTPUT_FORMAT,
      resolution: DEFAULT_IMAGE_GENERATION_RESOLUTION,
      references: [],
      status: "idle",
      resultUrl: null,
    }),
  },
  imageOutput: {
    type: "imageOutput",
    label: "Output",
    description: "Generated image result",
    palette: true,
    defaultData: () => ({
      resultUrl: null,
      status: "idle",
    }),
  },
  suppler: {
    type: "suppler",
    label: "Supplier",
    description: "Choose supplier product references",
    palette: true,
    defaultData: () => ({
      alias: "supplier",
      selectedProductType: null,
      productTypeQuery: "",
      supplierQuery: "",
      supplierId: null,
      supplierName: null,
      productId: null,
      productSubject: null,
      variantId: null,
      variantImageUrl: null,
      variantImageName: null,
    }),
  },
  action: {
    type: "action",
    label: "Action",
    description: "Track a workflow action",
    palette: true,
    defaultData: () => ({
      title: "Action",
      notes: "",
      status: "manual",
    }),
  },
  pantone: {
    type: "pantone",
    label: "Pantone",
    description: "Find Pantone library colors",
    palette: true,
    defaultData: () => ({
      alias: "pantone",
      query: "",
      code: null,
      name: null,
      hex: null,
      catalog: null,
      catalogFilter: null,
    }),
  },
};

/** Node types surfaced in the palette (excludes `generate` until M7). */
export const PALETTE_NODE_TYPES: NodeType[] = Object.values(NODE_META)
  .filter((m) => m.palette)
  .map((m) => m.type);

export function createNode(type: NodeType, position: { x: number; y: number }): CanvasNode {
  return {
    id: uid(),
    type,
    position,
    data: NODE_META[type].defaultData(),
  };
}
