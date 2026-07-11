import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_MODEL_IDS,
  MODEL_CATALOG,
  MODEL_CATALOG_GROUPS,
  normalizeImageGenerationModel,
} from "@/lib/image-generation-models";

describe("image generation model catalog", () => {
  it("enables every provider-supported image model", () => {
    expect(DEFAULT_IMAGE_GENERATION_MODEL).toBe("gpt-image-2");
    expect(
      IMAGE_GENERATION_MODEL_IDS.filter(
        (id) => MODEL_CATALOG.find((entry) => entry.id === id)?.enabled,
      ),
    ).toEqual(IMAGE_GENERATION_MODEL_IDS);
  });

  it("shows text and video aliases but disables them", () => {
    const disabledEntries = MODEL_CATALOG.filter((entry) => !entry.enabled);
    expect(disabledEntries.length).toBeGreaterThan(0);
    expect(disabledEntries.every((entry) => entry.capability !== "image")).toBe(true);
    expect(disabledEntries.some((entry) => entry.aliases.includes("GPT5 Standard"))).toBe(true);
    expect(disabledEntries.some((entry) => entry.aliases.includes("DeepSeek Flash"))).toBe(true);
    expect(disabledEntries.some((entry) => entry.aliases.includes("Seedance 2"))).toBe(true);
  });

  it("keeps all requested catalog groups and aliases", () => {
    expect(MODEL_CATALOG_GROUPS.map((group) => group.label)).toEqual([
      "Gemini Image Series",
      "GPT Image Series",
      "GPT Text Series",
      "DeepSeek Series",
      "Video Series",
    ]);
    expect(
      MODEL_CATALOG.find((entry) => entry.id === "gemini-3.1-flash-image-preview-4K")?.aliases,
    ).toEqual(["Banana 2", "Nano Banana 2"]);
    expect(MODEL_CATALOG.find((entry) => entry.id === "gpt-image-2")?.aliases).toEqual([
      "DALL-E 3",
      "GPT Image V2",
    ]);
  });

  it("normalizes legacy and unknown models to gpt-image-2", () => {
    expect(normalizeImageGenerationModel("flux")).toBe("gpt-image-2");
    expect(normalizeImageGenerationModel("flux-kontext")).toBe("gpt-image-2");
    expect(normalizeImageGenerationModel("gpt-5.4")).toBe("gpt-image-2");
    expect(normalizeImageGenerationModel("gemini-2.5-flash-image")).toBe("gemini-2.5-flash-image");
  });
});
