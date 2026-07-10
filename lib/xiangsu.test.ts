import { describe, expect, it, vi } from "vitest";

import { createXiangsuImageGenerator } from "@/lib/xiangsu";

const input = {
  model: "gpt-image-2" as const,
  prompt: "A precise product photograph",
  references: [],
};

describe("Xiangsu image generator", () => {
  it("converts a base64 response to a PNG data URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await expect(generate(input)).resolves.toEqual({
      url: "data:image/png;base64,aW1hZ2U=",
      model: "gpt-image-2",
    });

    const [, request] = fetcher.mock.calls[0];
    expect(request?.headers).toEqual({
      Authorization: "secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      model: "gpt-image-2",
      prompt: input.prompt,
      n: 1,
      size: "1024x1024",
    });
  });

  it("sends connected reference images to the provider", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await generate({
      ...input,
      prompt: "change @sweater texture to @vintage",
      references: [
        { kind: "image", alias: "vintage", url: "https://images.example/vintage.png" },
        { kind: "image", alias: "sweater", url: "https://images.example/sweater.png" },
      ],
    });

    const [, request] = fetcher.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as {
      model: string;
      prompt: string;
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
      n: number;
      size: string;
      image_urls: string[];
    };
    expect(body.model).toBe("gpt-image-2");
    expect(body.n).toBe(1);
    expect(body.size).toBe("1024x1024");
    expect(body.image_urls).toEqual([
      "https://images.example/sweater.png",
      "https://images.example/vintage.png",
    ]);
    expect(body.content).toEqual([
      { type: "text", text: body.prompt },
      { type: "image_url", image_url: { url: "https://images.example/sweater.png" } },
      { type: "image_url", image_url: { url: "https://images.example/vintage.png" } },
    ]);
    expect(body.prompt).toContain("Reference image 1 is @sweater");
    expect(body.prompt).toContain("Reference image 2 is @vintage");
    expect(body.prompt).toContain("Do not copy people, faces, bodies, poses");
  });

  it("sends Pantone swatches as image references instead of plain alias text", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await generate({
      ...input,
      prompt: "change @bre color to @Red 032 U",
      references: [
        { kind: "image", alias: "bre", url: "https://images.example/bre.png" },
        { kind: "pantone", alias: "Red 032 U", label: "Red 032 U", hex: "#f65058" },
      ],
    });

    const [, request] = fetcher.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as {
      prompt: string;
      image_urls: string[];
    };

    expect(body.image_urls[0]).toBe("https://images.example/bre.png");
    expect(body.image_urls[1]).toMatch(/^data:image\/svg\+xml/);
    expect(body.prompt).toContain("Reference image 1 is @bre");
    expect(body.prompt).toContain("Reference image 2 is @Red 032 U");
    expect(body.prompt).toContain("Pantone color swatch Red 032 U (#F65058)");
  });

  it("accepts a remote image URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ url: "https://images.example/generated.png" }] }),
      );
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await expect(generate(input)).resolves.toEqual({
      url: "https://images.example/generated.png",
      model: "gpt-image-2",
    });
  });

  it("rejects malformed JSON and missing image payloads", async () => {
    const invalidJson = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    const noImage = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [{}] }));

    await expect(
      createXiangsuImageGenerator({ apiKey: "secret", fetcher: invalidJson })(input),
    ).rejects.toThrow("invalid response");
    await expect(
      createXiangsuImageGenerator({ apiKey: "secret", fetcher: noImage })(input),
    ).rejects.toThrow("did not return an image");
  });

  it("sanitizes provider errors and requires a server key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "Authorization failed for secret-value" } },
          { status: 401 },
        ),
      );

    await expect(
      createXiangsuImageGenerator({ apiKey: "secret-value", fetcher })(input),
    ).rejects.toThrow("Authorization failed for [redacted]");
    await expect(createXiangsuImageGenerator({ apiKey: undefined })(input)).rejects.toThrow(
      "XIANGSU_API_KEY",
    );
  });

  it("times out aborted provider requests", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const generate = createXiangsuImageGenerator({
      apiKey: "secret",
      fetcher,
      timeoutMs: 1,
    });

    await expect(generate(input)).rejects.toThrow("timed out");
  });
});
