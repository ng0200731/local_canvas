import { z } from "zod";

import { genericNodeDefinitionSchema, type GenericNodeDefinition } from "@/lib/workspace-settings";

import { createNode } from "./registry";
import { NODE_TYPES, type CanvasNode } from "./types";

export const PALETTE_DRAG_MIME_TYPE = "application/ica-node";

const paletteDragPayloadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("registered-node"),
      type: z.enum(NODE_TYPES),
    })
    .strict(),
  z
    .object({
      kind: z.literal("generic-preset"),
      definitionId: z.string().trim().min(1),
    })
    .strict(),
]);

export type PaletteDragPayload = z.infer<typeof paletteDragPayloadSchema>;

export function serializePaletteDragPayload(payload: PaletteDragPayload): string {
  return JSON.stringify(paletteDragPayloadSchema.parse(payload));
}

export function parsePaletteDragPayload(value: unknown): PaletteDragPayload | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = paletteDragPayloadSchema.safeParse(JSON.parse(value) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sortGenericNodeDefinitions(
  definitions: readonly GenericNodeDefinition[],
): GenericNodeDefinition[] {
  return [...definitions].sort(
    (left, right) => left.sortIndex - right.sortIndex || left.name.localeCompare(right.name),
  );
}

export function createGenericPresetNode(
  definition: GenericNodeDefinition,
  position: { x: number; y: number },
): CanvasNode {
  const parsed = genericNodeDefinitionSchema.parse(definition);
  const node = createNode("imageInput", position);

  return {
    ...node,
    data: {
      ...node.data,
      alias: parsed.name,
      imageUrl: parsed.imageUrl,
      storagePath: parsed.storagePath,
      genericDefinitionId: parsed.id,
      genericDefinitionName: parsed.name,
    },
  };
}
