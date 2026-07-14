import { describe, expect, it } from "vitest";

import {
  compileGeneratePromptRows,
  generatePromptRowState,
  masksForPromptSource,
  normalizeGeneratePromptRow,
  type GeneratePromptSourceReference,
} from "@/lib/generate-prompt";

const references: GeneratePromptSourceReference[] = [
  {
    nodeId: "product-node",
    alias: "product",
    masks: [
      { id: "collar-id", name: "collar" },
      { id: "logo-id", name: "logo" },
    ],
  },
  { nodeId: "supplier-node", alias: "supplier", masks: [{ id: "sole-id", name: "sole" }] },
];

describe("generate prompt rows", () => {
  it("returns only masks belonging to the selected source", () => {
    expect(masksForPromptSource(references, "product-node").map((mask) => mask.name)).toEqual([
      "collar",
      "logo",
    ]);
    expect(masksForPromptSource(references, "missing")).toEqual([]);
  });

  it("migrates legacy alias and mask-name values to stable IDs", () => {
    expect(
      normalizeGeneratePromptRow(
        {
          id: "row-1",
          sourceAlias: "@product",
          maskName: "collar",
          changeType: "texture",
          targetAlias: "@supplier",
        },
        references,
        "fallback",
      ),
    ).toEqual({
      id: "row-1",
      sourceNodeId: "product-node",
      maskId: "collar-id",
      changeType: "texture",
      targetText: "@supplier",
    });
  });

  it("compiles only complete rows in point form", () => {
    const complete = {
      id: "row-1",
      sourceNodeId: "product-node",
      maskId: "collar-id",
      changeType: "color" as const,
      targetText: "@pantone red",
    };
    const partial = { ...complete, id: "row-2", maskId: "" };
    expect(generatePromptRowState(partial, references)).toBe("partial");
    expect(compileGeneratePromptRows([complete, partial], references)).toBe(
      "- @product use collar region change color to @pantone red",
    );
  });
});
