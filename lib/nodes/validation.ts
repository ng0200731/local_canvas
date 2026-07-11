import { z } from "zod";

import {
  EMPTY_CANVAS_CONTENT,
  NODE_TYPES,
  type CanvasContent,
  type CanvasEdge,
  type CanvasNode,
} from "./types";

const recordSchema = z.record(z.string(), z.unknown());
const nodeTypeSchema = z.preprocess(
  (value) => (value === "output" ? "imageOutput" : value),
  z.enum(NODE_TYPES),
);

export const xyPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .passthrough();

export const canvasNodeSchema = z
  .object({
    id: z.string().min(1),
    type: nodeTypeSchema,
    position: xyPositionSchema,
    data: recordSchema.default({}),
  })
  .passthrough();

export const canvasEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
    data: recordSchema.optional(),
  })
  .passthrough();

const canvasContentSchema = z.object({
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
});

export function parseCanvasNode(value: unknown): CanvasNode {
  return canvasNodeSchema.parse(value) as CanvasNode;
}

export function parseCanvasEdge(value: unknown): CanvasEdge {
  return canvasEdgeSchema.parse(value) as CanvasEdge;
}

export function parseCanvasContent(value: unknown): CanvasContent {
  if (value === null || value === undefined) return EMPTY_CANVAS_CONTENT;

  const parsed = canvasContentSchema.parse(value);
  return {
    nodes: parsed.nodes.map((node) => node as CanvasNode),
    edges: parsed.edges.map((edge) => edge as CanvasEdge),
  };
}

export function safeParseCanvasContent(value: unknown): CanvasContent {
  const parsed = canvasContentSchema.safeParse(value);
  if (!parsed.success) return EMPTY_CANVAS_CONTENT;

  return {
    nodes: parsed.data.nodes.map((node) => node as CanvasNode),
    edges: parsed.data.edges.map((edge) => edge as CanvasEdge),
  };
}
