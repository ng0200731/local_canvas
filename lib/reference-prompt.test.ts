import { describe, expect, it } from "vitest";

import { compileReferencePrompt } from "@/lib/reference-prompt";

describe("reference prompt compiler", () => {
  it("orders provider images by @mention order and maps aliases explicitly", () => {
    const compiled = compileReferencePrompt("change @sweater texture to @vintage", [
      { kind: "image", alias: "vintage", url: "https://images.example/vintage.png" },
      { kind: "image", alias: "sweater", url: "https://images.example/sweater.png" },
    ]);

    expect(compiled.imageUrls).toEqual([
      "https://images.example/sweater.png",
      "https://images.example/vintage.png",
    ]);
    expect(compiled.prompt).toContain("Reference image 1 is @sweater");
    expect(compiled.prompt).toContain("Reference image 2 is @vintage");
  });

  it("adds a strict texture-transfer constraint", () => {
    const compiled = compileReferencePrompt("change @sweater texture to @vintage", [
      { kind: "image", alias: "sweater", url: "https://images.example/sweater.png" },
      { kind: "image", alias: "vintage", url: "https://images.example/vintage.png" },
    ]);

    expect(compiled.prompt).toContain("Use @sweater as the target/base image");
    expect(compiled.prompt).toContain("Use @vintage only as the source of texture");
    expect(compiled.prompt).toContain("Do not copy people, faces, bodies, poses");
  });

  it("keeps unmentioned references after mentioned references", () => {
    const compiled = compileReferencePrompt("edit @product", [
      { kind: "image", alias: "extra", url: "https://images.example/extra.png" },
      { kind: "image", alias: "product", url: "https://images.example/product.png" },
    ]);

    expect(compiled.imageUrls).toEqual([
      "https://images.example/product.png",
      "https://images.example/extra.png",
    ]);
  });

  it("leaves prompt-only generation unchanged", () => {
    expect(compileReferencePrompt("a red circle", [])).toEqual({
      prompt: "a red circle",
      imageUrls: [],
    });
  });

  it("turns Pantone aliases into ordered swatch image references", () => {
    const compiled = compileReferencePrompt("change @bre color to @Red 032 U", [
      { kind: "pantone", alias: "Red 032 U", label: "Red 032 U", hex: "#f65058" },
      { kind: "image", alias: "bre", url: "https://images.example/bre.png" },
    ]);

    expect(compiled.imageUrls[0]).toBe("https://images.example/bre.png");
    expect(compiled.imageUrls[1]).toMatch(/^data:image\/svg\+xml/);
    expect(compiled.prompt).toContain("Reference image 1 is @bre");
    expect(compiled.prompt).toContain("Reference image 2 is @Red 032 U");
    expect(compiled.prompt).toContain("Pantone color swatch Red 032 U (#F65058)");
    expect(compiled.prompt).toContain("Use @bre as the target/base image");
    expect(compiled.prompt).toContain("Use @Red 032 U only as the color reference");
  });
});
