import { describe, expect, it } from "vitest";

import {
  compileGeneratePromptRows,
  generatePromptRowState,
  generatePromptRowText,
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

  it("compiles rows without requiring a mask", () => {
    const complete = {
      id: "row-1",
      sourceNodeId: "product-node",
      maskId: "collar-id",
      changeType: "color" as const,
      targetText: "@pantone red",
    };
    const partial = { ...complete, id: "row-2", maskId: "" };
    expect(generatePromptRowState(partial, references)).toBe("complete");
    expect(compileGeneratePromptRows([complete, partial], references)).toBe(
      "- @product use collar png file mask change color to @pantone red\n- @product change color to @pantone red",
    );
  });

  it("strips a redundant leading 'change to' or 'change' from the target text", () => {
    const row = {
      id: "row-3",
      sourceNodeId: "product-node",
      maskId: "collar-id",
      changeType: "object" as const,
      targetText: "change to @elastic",
    };
    expect(generatePromptRowText(row, references)).toBe(
      "@product use collar png file mask change object to @elastic",
    );
    const rowPlain = { ...row, targetText: "@elastic" };
    expect(generatePromptRowText(rowPlain, references)).toBe(
      "@product use collar png file mask change object to @elastic",
    );
    const rowChangeOnly = { ...row, targetText: "change @elastic" };
    expect(generatePromptRowText(rowChangeOnly, references)).toBe(
      "@product use collar png file mask change object to @elastic",
    );
  });
});
