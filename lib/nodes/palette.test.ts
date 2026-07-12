import { describe, expect, it } from "vitest";

import type { GenericNodeDefinition } from "@/lib/workspace-settings";

import { createNode } from "./registry";
import {
  createGenericPresetNode,
  parsePaletteDragPayload,
  serializePaletteDragPayload,
  sortGenericNodeDefinitions,
} from "./palette";

function genericDefinition(overrides: Partial<GenericNodeDefinition> = {}): GenericNodeDefinition {
  return {
    id: "generic-1",
    name: "Rib texture",
    imageUrl: "https://example.com/rib.webp",
    storagePath: "user/rib.webp",
    sortIndex: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("canvas node palette helpers", () => {
  it("round-trips validated registered and generic drag payloads", () => {
    const registered = { kind: "registered-node", type: "pantone" } as const;
    const generic = { kind: "generic-preset", definitionId: "generic-1" } as const;

    expect(parsePaletteDragPayload(serializePaletteDragPayload(registered))).toEqual(registered);
    expect(parsePaletteDragPayload(serializePaletteDragPayload(generic))).toEqual(generic);
  });

  it("rejects malformed, incomplete, and unknown drag payloads", () => {
    expect(parsePaletteDragPayload("not-json")).toBeNull();
    expect(parsePaletteDragPayload(JSON.stringify({ kind: "generic-preset" }))).toBeNull();
    expect(
      parsePaletteDragPayload(JSON.stringify({ kind: "registered-node", type: "not-a-node" })),
    ).toBeNull();
  });

  it("creates an image input snapshot from a generic definition", () => {
    const definition = genericDefinition();
    const node = createGenericPresetNode(definition, { x: 24, y: 48 });
    definition.name = "Changed later";
    definition.imageUrl = "https://example.com/changed.webp";

    expect(node).toMatchObject({
      type: "imageInput",
      position: { x: 24, y: 48 },
      data: {
        alias: "Rib texture",
        imageUrl: "https://example.com/rib.webp",
        storagePath: "user/rib.webp",
        genericDefinitionId: "generic-1",
        genericDefinitionName: "Rib texture",
      },
    });
  });

  it("orders generic definitions by their saved sequence", () => {
    const definitions = [
      genericDefinition({ id: "third", name: "Third", sortIndex: 2 }),
      genericDefinition({ id: "first", name: "First", sortIndex: 0 }),
      genericDefinition({ id: "second", name: "Second", sortIndex: 1 }),
    ];

    expect(sortGenericNodeDefinitions(definitions).map((definition) => definition.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("gives new Pantone nodes a persisted alias", () => {
    expect(createNode("pantone", { x: 0, y: 0 }).data.alias).toBe("pantone");
  });
});
