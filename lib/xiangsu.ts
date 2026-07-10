import "server-only";

import { z } from "zod";

import { env } from "@/lib/env";
import type {
  ImageGenerationModelId,
  ImageGenerationReference,
} from "@/lib/image-generation-models";
import { compileReferencePrompt } from "@/lib/reference-prompt";

const XIANGSU_GENERATION_URL = "https://www.xiangsuai.cn/v1/images/generations";
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

export function createXiangsuImageGenerator({
  apiKey,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: XiangsuGeneratorOptions) {
  return async function generateImage(input: XiangsuGenerateInput): Promise<XiangsuGenerateOutput> {
    if (!apiKey) {
      throw new Error("AI generation is disabled. Set XIANGSU_API_KEY in .env.local.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const compiled = compileReferencePrompt(input.prompt, input.references);

    try {
      const response = await fetcher(XIANGSU_GENERATION_URL, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          prompt: compiled.prompt,
          n: 1,
          size: "1024x1024",
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

      const parsed = providerSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("The image provider did not return an image.");
      }

      const image = parsed.data.data[0];
      const url = image.url ?? `data:image/png;base64,${image.b64_json}`;
      return { url, model: input.model };
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error("Image generation timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const generateXiangsuImage = createXiangsuImageGenerator({
  apiKey: env.XIANGSU_API_KEY,
});
