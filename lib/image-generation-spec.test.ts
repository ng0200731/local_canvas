import { describe, expect, it } from "vitest";

import { imageOutputSpecLine } from "@/lib/image-generation-spec";

const MATCH_COMMON: Parameters<typeof imageOutputSpecLine>[0] = {
  isGptModel: true,
  matchSourceSize: true,
  size: "1024x1024",
  resolution: "preview",
};

describe("imageOutputSpecLine", () => {
  it("returns an empty string for non-GPT models", () => {
    expect(
      imageOutputSpecLine({ ...MATCH_COMMON, isGptModel: false }),
    ).toBe("");
  });

  it("emits the match-source-size spec line when matchSourceSize is true", () => {
    const line = imageOutputSpecLine({ ...MATCH_COMMON, matchSourceSize: true });
    expect(line.startsWith("\n\n图像输出规格：")).toBe(true);
    expect(line).toContain("与参考图1保持完全一致的尺寸和宽高比");
  });

  it("emits the fixed aspect-ratio spec line when matchSourceSize is false", () => {
    const line = imageOutputSpecLine({
      ...MATCH_COMMON,
      matchSourceSize: false,
      size: "1536x1024",
      resolution: "2K",
    });
    expect(line.startsWith("\n\n图像输出规格：")).toBe(true);
    expect(line).toContain("宽高比生成");
    expect(line).toContain("不要因为参考图尺寸改变最终画幅");
  });
});
