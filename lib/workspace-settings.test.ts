import { describe, expect, it } from "vitest";

import {
  genericNodeDefinitionInputSchema,
  genericNodeDefinitionSchema,
} from "./workspace-settings";

describe("generic node settings", () => {
  it("normalizes a legacy single-image definition", () => {
    expect(
      genericNodeDefinitionSchema.parse({
        id: "legacy-logo",
        name: "Logo",
        imageUrl: "https://example.com/logo.webp",
        storagePath: "user/logo.webp",
        sortIndex: 0,
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      }),
    ).toMatchObject({
      images: [
        {
          id: "legacy-logo:image:0",
          name: "Image 1",
          url: "https://example.com/logo.webp",
          storagePath: "user/logo.webp",
        },
      ],
    });
  });

  it("requires at least one validated image", () => {
    expect(genericNodeDefinitionInputSchema.safeParse({ name: "Logo", images: [] }).success).toBe(
      false,
    );
    expect(
      genericNodeDefinitionInputSchema.safeParse({
        name: "Logo",
        images: [{ id: "logo-1", name: "logo.webp", url: "", storagePath: null }],
      }).success,
    ).toBe(false);
  });
});
