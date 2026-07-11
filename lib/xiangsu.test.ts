import { describe, expect, it, vi } from "vitest";

import { createXiangsuImageGenerator } from "@/lib/xiangsu";

const sweaterDataUrl = "data:image/png;base64,c3dlYXRlcg==";
const vintageDataUrl = "data:image/png;base64,dmludGFnZQ==";

const input = {
  model: "gpt-image-2" as const,
  prompt: "A precise product photograph",
  references: [],
};

function formDataBody(body: BodyInit | null | undefined): FormData {
  expect(body).toBeInstanceOf(FormData);
  return body as FormData;
}

function stringFormValue(form: FormData, name: string): string {
  const value = form.get(name);
  expect(typeof value).toBe("string");
  return String(value);
}

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

  it("sends GPT image reference edits as ordered multipart image files", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await generate({
      ...input,
      prompt: "change @sweater texture to @vintage",
      references: [
        { kind: "image", alias: "vintage", url: vintageDataUrl },
        { kind: "image", alias: "sweater", url: sweaterDataUrl },
      ],
    });

    const [url, request] = fetcher.mock.calls[0];
    const form = formDataBody(request?.body);
    const images = form.getAll("image");
    expect(url).toBe("https://www.xiangsuai.cn/v1/images/edits");
    expect(request?.headers).toEqual({ Authorization: "secret" });
    expect(stringFormValue(form, "model")).toBe("gpt-image-2");
    expect(stringFormValue(form, "n")).toBe("1");
    expect(stringFormValue(form, "size")).toBe("1024x1024");
    expect(images).toHaveLength(2);
    expect(images[0]).toBeInstanceOf(Blob);
    expect(images[1]).toBeInstanceOf(Blob);
    expect((images[0] as Blob).type).toBe("image/png");
    expect((images[1] as Blob).type).toBe("image/png");
    expect(stringFormValue(form, "prompt")).toContain("Provider image 1 is @sweater");
    expect(stringFormValue(form, "prompt")).toContain("Provider image 2 is @vintage");
    expect(stringFormValue(form, "prompt")).toContain("Do not copy people, faces, bodies, poses");
  });

  it("sends Pantone color edits as the second multipart image", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await generate({
      ...input,
      prompt: "change @sweater color to @Yellow C and keep every detail from @sweater",
      references: [
        { kind: "image", alias: "sweater", url: sweaterDataUrl },
        { kind: "pantone", alias: "Yellow C", label: "Yellow C", hex: "#fedd00" },
      ],
    });

    const [, request] = fetcher.mock.calls[0];
    const form = formDataBody(request?.body);
    const images = form.getAll("image");
    const prompt = stringFormValue(form, "prompt");

    expect(images).toHaveLength(2);
    expect((images[0] as Blob).type).toBe("image/png");
    expect((images[1] as Blob).type).toBe("image/png");
    expect(prompt).toContain("Provider image 1 is @sweater");
    expect(prompt).toContain("Provider image 2 is @Yellow C");
    expect(prompt).toContain("solid Pantone color reference for Yellow C (#FEDD00)");
    expect(prompt).toContain("Provider image 1 / @sweater is the target/base image");
    expect(prompt).toContain("Provider image 2 / @Yellow C is only a color reference");
    expect(prompt).toContain("Preserve every detail from @sweater");
  });

  it("uses the native Gemini endpoint and parses its inline image", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ candidates: [{ content: { parts: [
        { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
      ] } }] }));
    const generate = createXiangsuImageGenerator({ apiKey: "secret", fetcher });

    await expect(generate({
      model: "gemini-3.1-flash-image-preview",
      prompt: "change @sweater color to @Yellow C",
      references: [
        { kind: "image", alias: "sweater", url: sweaterDataUrl },
        { kind: "pantone", alias: "Yellow C", label: "Yellow C", hex: "#fedd00" },
      ],
    })).resolves.toEqual({
      url: "data:image/png;base64,aW1hZ2U=", model: "gemini-3.1-flash-image-preview",
    });
    const [url, request] = fetcher.mock.calls.at(-1) ?? [];
    expect(url).toBe("https://www.xiangsuai.cn/v1beta/models/gemini-3.1-flash-image-preview:generateContent");
    expect((request?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(String(request?.body)) as { generationConfig: { imageConfig: { imageSize: string } } };
    expect(body.generationConfig.imageConfig.imageSize).toBe("1K");
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
