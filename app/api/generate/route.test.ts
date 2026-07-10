import { describe, expect, it, vi } from "vitest";

import { createGeneratePostHandler } from "@/app/api/generate/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/generate", () => {
  it("returns 503 when Xiangsu is not configured", async () => {
    const handler = createGeneratePostHandler({
      configured: false,
      generate: vi.fn(),
    });

    const response = await handler(request({ model: "gpt-image-2", prompt: "test" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "AI generation is disabled. Set XIANGSU_API_KEY in .env.local.",
    });
  });

  it("validates supported image models and prompt boundaries", async () => {
    const generate = vi.fn();
    const handler = createGeneratePostHandler({ configured: true, generate });

    expect((await handler(request({ model: "gpt-5.4", prompt: "test" }))).status).toBe(400);
    expect((await handler(request({ model: "gpt-image-2", prompt: "" }))).status).toBe(400);
    expect(
      (
        await handler(
          request({
            model: "gpt-image-2",
            prompt: "x".repeat(2001),
          }),
        )
      ).status,
    ).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns the generated image and official model ID", async () => {
    const generate = vi.fn().mockResolvedValue({
      url: "data:image/png;base64,aW1hZ2U=",
      model: "gpt-image-2",
    });
    const handler = createGeneratePostHandler({ configured: true, generate });

    const response = await handler(
      request({ model: "gpt-image-2", prompt: "A clean studio photograph" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "data:image/png;base64,aW1hZ2U=",
      model: "gpt-image-2",
    });
    expect(generate).toHaveBeenCalledWith({
      model: "gpt-image-2",
      prompt: "A clean studio photograph",
      references: [],
    });
  });

  it("validates and forwards reference image URLs", async () => {
    const generate = vi.fn().mockResolvedValue({
      url: "data:image/png;base64,aW1hZ2U=",
      model: "gemini-3.1-flash-image-preview",
    });
    const handler = createGeneratePostHandler({ configured: true, generate });
    const references = [
      { kind: "image" as const, alias: "product", url: "https://images.example/reference.png" },
      { kind: "image" as const, alias: "texture", url: "data:image/png;base64,aW1hZ2U=" },
    ];

    const response = await handler(
      request({
        model: "gemini-3.1-flash-image-preview",
        prompt: "Keep @product and apply @texture",
        references,
      }),
    );

    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledWith({
      model: "gemini-3.1-flash-image-preview",
      prompt: "Keep @product and apply @texture",
      references,
    });
  });

  it("rejects invalid reference URLs and more than 14 references", async () => {
    const generate = vi.fn();
    const handler = createGeneratePostHandler({ configured: true, generate });

    const invalidUrlResponse = await handler(
      request({
        model: "gpt-image-2",
        prompt: "test",
        references: [{ kind: "image", alias: "bad", url: "not-an-image-url" }],
      }),
    );
    const tooManyResponse = await handler(
      request({
        model: "gpt-image-2",
        prompt: "test",
        references: Array.from({ length: 15 }, (_, index) => ({
          kind: "image",
          alias: `reference-${index}`,
          url: `https://images.example/reference-${index}.png`,
        })),
      }),
    );

    expect(invalidUrlResponse.status).toBe(400);
    expect(tooManyResponse.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps provider failures to a sanitized 502 response", async () => {
    const handler = createGeneratePostHandler({
      configured: true,
      generate: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
    });

    const response = await handler(request({ model: "gpt-image-2", prompt: "test" }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Provider unavailable" });
  });
});
