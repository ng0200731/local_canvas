import "server-only";

import { z } from "zod";

import { env } from "@/lib/env";
import type {
  ImageGenerationOutputFormat,
  ImageGenerationModelId,
  ImageGenerationReference,
  ImageGenerationResolution,
  ImageGenerationSize,
} from "@/lib/image-generation-models";
import {
  aspectRatioForImageGenerationSize,
  geminiImageSizeForResolution,
  xiangsuImageModelIdSchema,
} from "@/lib/image-generation-models";
import { compileReferencePrompt } from "@/lib/reference-prompt";

const XIANGSU_GENERATION_URL = "https://www.xiangsuai.cn/v1/images/generations";
const XIANGSU_EDIT_URL = "https://www.xiangsuai.cn/v1/images/edits";
const XIANGSU_GEMINI_BASE_URL = "https://www.xiangsuai.cn/v1beta/models";
const DEFAULT_TIMEOUT_MS = 120_000;

const providerImageSchema = z
  .object({
    b64_json: z.string().min(1).optional(),
    url: z.string().url().optional(),
  })
  .refine((image) => Boolean(image.b64_json || image.url), {
    message: "Image payload is missing.",
  });

const providerSuccessSchema = z.object({
  data: z.array(providerImageSchema).min(1),
});

const geminiSuccessSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(
            z
              .object({
                inlineData: z.object({ mimeType: z.string(), data: z.string().min(1) }).optional(),
                inline_data: z
                  .object({ mime_type: z.string(), data: z.string().min(1) })
                  .optional(),
              })
              .passthrough(),
          ),
        }),
      }),
    )
    .min(1),
});

const providerErrorSchema = z.object({
  error: z
    .union([
      z.string(),
      z.object({
        message: z.string().optional(),
      }),
    ])
    .optional(),
  message: z.string().optional(),
});

export interface XiangsuGenerateInput {
  model: ImageGenerationModelId;
  prompt: string;
  size: ImageGenerationSize;
  outputFormat: ImageGenerationOutputFormat;
  resolution: ImageGenerationResolution;
  references: ImageGenerationReference[];
}

export interface XiangsuGenerateOutput {
  url: string;
  model: ImageGenerationModelId;
}

interface XiangsuGeneratorOptions {
  apiKey: string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function providerErrorMessage(payload: unknown): string | null {
  const parsed = providerErrorSchema.safeParse(payload);
  if (!parsed.success) return null;
  if (typeof parsed.data.error === "string") return parsed.data.error;
  return parsed.data.error?.message ?? parsed.data.message ?? null;
}

function sanitizeMessage(message: string, apiKey: string): string {
  return message.replaceAll(apiKey, "[redacted]").slice(0, 500);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

function isNetworkFetchError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("fetch failed")
  );
}

function promptContent(prompt: string, imageUrls: readonly string[]) {
  if (imageUrls.length === 0) return prompt;

  return [
    { type: "text" as const, text: prompt },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];
}

function isGptImageModel(model: ImageGenerationModelId): boolean {
  return model.startsWith("gpt-image");
}

function isDallEModel(model: ImageGenerationModelId): boolean {
  return model.startsWith("dall-e-");
}

function isGeminiImageModel(model: ImageGenerationModelId): boolean {
  return model.startsWith("gemini-");
}

async function geminiParts(
  prompt: string,
  imageUrls: readonly string[],
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const url of imageUrls) {
    const blob = await blobFromReferenceUrl(url, fetcher, signal);
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    parts.push({ inline_data: { mime_type: blob.type || "image/png", data } });
  }
  return parts;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "bin";
}

function blobFromDataUrl(url: string): Blob {
  const commaIndex = url.indexOf(",");
  if (!url.startsWith("data:") || commaIndex < 0) {
    throw new Error("Reference image data URL is invalid.");
  }

  const metadata = url.slice("data:".length, commaIndex);
  const metadataParts = metadata.split(";");
  const mimeType = metadataParts[0] || "application/octet-stream";
  const isBase64 = metadataParts.includes("base64");
  const payload = url.slice(commaIndex + 1);
  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return new Blob([bytes], { type: mimeType });
}

async function blobFromReferenceUrl(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted();
  if (url.startsWith("data:")) return blobFromDataUrl(url);

  const response = await fetcher(url, { signal });
  if (!response.ok) {
    throw new Error(`Reference image request failed with ${response.status}.`);
  }

  return response.blob();
}

async function appendEditImages(
  form: FormData,
  imageUrls: readonly string[],
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<void> {
  for (const [index, imageUrl] of imageUrls.entries()) {
    const blob = await blobFromReferenceUrl(imageUrl, fetcher, signal);
    const extension = extensionForMimeType(blob.type);
    form.append("image", blob, `reference-${index + 1}.${extension}`);
  }
}

export function createXiangsuImageGenerator({
  apiKey,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: XiangsuGeneratorOptions) {
  return async function generateImage(
    input: XiangsuGenerateInput,
    requestSignal?: AbortSignal,
  ): Promise<XiangsuGenerateOutput> {
    if (!apiKey) {
      throw new Error("AI generation is disabled. Set XIANGSU_API_KEY in .env.local.");
    }

    if (!xiangsuImageModelIdSchema.safeParse(input.model).success) {
      throw new Error("This model is not supported by Xiangsu image generation. Use GPT Image 2.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromRequest = () => controller.abort(requestSignal?.reason);
    if (requestSignal?.aborted) {
      abortFromRequest();
    } else {
      requestSignal?.addEventListener("abort", abortFromRequest, { once: true });
    }
    try {
      const compiled = compileReferencePrompt(input.prompt, input.references);

      if (compiled.imageUrls.length > 0 && isDallEModel(input.model)) {
        throw new Error(
          "DALL-E models do not support reference-image editing. Use a GPT Image model.",
        );
      }

      const response = isGeminiImageModel(input.model)
        ? await fetcher(`${XIANGSU_GEMINI_BASE_URL}/${input.model}:generateContent`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: await geminiParts(
                    compiled.prompt,
                    compiled.imageUrls,
                    fetcher,
                    controller.signal,
                  ),
                },
              ],
              generationConfig: {
                imageConfig: {
                  aspectRatio: aspectRatioForImageGenerationSize(input.size),
                  imageSize: geminiImageSizeForResolution(input.resolution),
                },
              },
            }),
            signal: controller.signal,
          })
        : compiled.imageUrls.length > 0 && isGptImageModel(input.model)
          ? await (async () => {
              const form = new FormData();
              form.append("model", input.model);
              form.append("prompt", compiled.prompt);
              form.append("n", "1");
              form.append("size", input.size);
              form.append("background", "auto");
              form.append("quality", "auto");
              form.append("output_format", input.outputFormat);
              await appendEditImages(form, compiled.imageUrls, fetcher, controller.signal);

              return fetcher(XIANGSU_EDIT_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                },
                body: form,
                signal: controller.signal,
              });
            })()
          : await fetcher(XIANGSU_GENERATION_URL, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: input.model,
                prompt: compiled.prompt,
                n: 1,
                size: input.size,
                background: "auto",
                quality: "auto",
                output_format: input.outputFormat,
                ...(compiled.imageUrls.length > 0
                  ? {
                      image_urls: compiled.imageUrls,
                      content: promptContent(compiled.prompt, compiled.imageUrls),
                    }
                  : {}),
              }),
              signal: controller.signal,
            });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The image provider returned an invalid response.");
      }

      if (!response.ok) {
        const message = providerErrorMessage(payload) ?? "The image provider rejected the request.";
        throw new Error(sanitizeMessage(message, apiKey));
      }

      if (isGeminiImageModel(input.model)) {
        const parsedGemini = geminiSuccessSchema.safeParse(payload);
        if (!parsedGemini.success) throw new Error("The Gemini provider did not return an image.");
        const imagePart = parsedGemini.data.candidates[0].content.parts.find(
          (part) => part.inlineData || part.inline_data,
        );
        const inline = imagePart?.inlineData
          ? { mimeType: imagePart.inlineData.mimeType, data: imagePart.inlineData.data }
          : imagePart?.inline_data
            ? { mimeType: imagePart.inline_data.mime_type, data: imagePart.inline_data.data }
            : null;
        if (!inline) throw new Error("The Gemini provider did not return an image.");
        return { url: `data:${inline.mimeType};base64,${inline.data}`, model: input.model };
      }

      const parsed = providerSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("The image provider did not return an image.");
      }

      const image = parsed.data.data[0];
      const url = image.url ?? `data:image/png;base64,${image.b64_json}`;
      return { url, model: input.model };
    } catch (error) {
      if (isAbortError(error)) {
        if (requestSignal?.aborted) {
          throw requestSignal.reason instanceof Error
            ? requestSignal.reason
            : new DOMException("Generation cancelled", "AbortError");
        }
        throw new Error("Image generation timed out. Please try again.");
      }
      if (isNetworkFetchError(error)) {
        throw new Error(
          "The image provider connection failed. Please retry, or switch to GPT Image 2 / 1.5 Pro.",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      requestSignal?.removeEventListener("abort", abortFromRequest);
    }
  };
}

export const generateXiangsuImage = createXiangsuImageGenerator({
  apiKey: env.XIANGSU_API_KEY,
});
