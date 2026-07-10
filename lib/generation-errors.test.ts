import { describe, expect, it } from "vitest";

import { isStaleGenerationConfigurationError } from "@/lib/generation-errors";

describe("generation error helpers", () => {
  it("recognizes persisted Xiangsu configuration errors with spacing differences", () => {
    expect(
      isStaleGenerationConfigurationError(
        "AI generation is disabled. Set XIANGSU_API_KEY in .env.local.",
      ),
    ).toBe(true);
    expect(
      isStaleGenerationConfigurationError(
        "AI generation is disabled. SetXIANGSU_API_KEY in .env.local",
      ),
    ).toBe(true);
  });

  it("preserves real generation errors", () => {
    expect(isStaleGenerationConfigurationError("Provider unavailable")).toBe(false);
    expect(isStaleGenerationConfigurationError(undefined)).toBe(false);
  });
});
