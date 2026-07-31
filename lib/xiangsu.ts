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
  gptImageQualityForResolution,
  gptImageSizeForResolution,
  xiangsuImageModelIdSchema,
} from "@/lib/image-generation-models";
import { imageOutputSpecLine } from "@/lib/image-generation-spec";
import {
  compileReferencePrompt,
  orderedReferences,
  referencesForProvider,
  type ProviderImageReference,
} from "@/lib/reference-prompt";
import { compositeMaskedEdit } from "@/lib/mask-composite";

const XIANGSU_GENERATION_URL = "https://www.xiangsuai.cn/v1/images/generations";
const XIANGSU_EDIT_URL = "https://www.xiangsuai.cn/v1/images/edits";
const XIANGSU_GEMINI_BASE_URL = "https://www.xiangsuai.cn/v1beta/models";

const providerImageSchema = z
  .object({
    b64_json: z.string().min(1).optional(),
    url: z.string().url().optional(),
    image_url: z
      .union([z.string().url(), z.object({ url: z.string().url() })])
      .optional(),
    result_url: z.string().url().optional(),
    output_url: z.string().url().optional(),
  })
  .passthrough();

const providerSuccessSchema = z
  .object({
    data: z.array(providerImageSchema).optional(),
    result: z.array(providerImageSchema).optional(),
    output: z.array(providerImageSchema).optional(),
    images: z.array(providerImageSchema).optional(),
    image: z.array(providerImageSchema).optional(),
  })
  .passthrough();

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
  systemPrompt?: string;
  size: ImageGenerationSize;
  outputFormat: ImageGenerationOutputFormat;
  resolution: ImageGenerationResolution;
  references: ImageGenerationReference[];
  matchSourceSize?: boolean;
}

export interface XiangsuGenerateOutput {
  url: string;
  model: ImageGenerationModelId;
  /** Diagnostics captured during the request — the compiled prompt text
   * actually sent, the resolved alias→image/mask map, and the multipart
   * form fields. Populated only for GPT image edits; empty for Gemini. */
  diagnostics?: XiangsuGenerateDiagnostics;
}

export interface XiangsuGenerateDiagnostics {
  compiledPrompt: string;
  resolvedReferences: Array<{
    alias: string;
    role: "base-image-with-mask" | "base-image" | "reference-image" | "pantone";
    imageUrl?: string;
    maskUrl?: string;
    description?: string;
  }>;
  formFields: Record<string, string>;
}

interface XiangsuGeneratorOptions {
  apiKey: string | undefined;
  fetcher?: typeof fetch;
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

  // Relative URLs (e.g. legacy mask paths saved as "/uploads/masks/...") have
  // no origin to resolve against on the server; pin them to the public app URL.
  let target = url;
  if (url.startsWith("/")) {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    target = `${baseUrl}${url}`;
  }

  const response = await fetcher(target, { signal });
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
): Promise<{ width: number; height: number } | null> {
  let firstImageDimensions: { width: number; height: number } | null = null;
  for (const [index, imageUrl] of imageUrls.entries()) {
    const blob = await blobFromReferenceUrl(imageUrl, fetcher, signal);
    const extension = extensionForMimeType(blob.type);
    form.append("image", blob, `reference-${index + 1}.${extension}`);
    if (index === 0) {
      firstImageDimensions = await imageDimensions(blob);
    }
  }
  return firstImageDimensions;
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const buffer = Buffer.from(await blob.arrayBuffer());
    // PNG: bytes 16..24 are width/height big-endian 32-bit.
    if (buffer.length >= 24 && buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG: scan SOF0 (0xFFC0) marker for dimensions.
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        const segmentStart = offset + 2;
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
          if (segmentStart + 7 <= buffer.length) {
            const height = buffer.readUInt16BE(segmentStart + 3);
            const width = buffer.readUInt16BE(segmentStart + 5);
            return { width, height };
          }
          break;
        }
        if (marker === 0xd8 || marker === 0xd9) break;
        if (segmentStart + 1 >= buffer.length) break;
        const segmentLength = buffer.readUInt16BE(segmentStart);
        offset = segmentStart + segmentLength;
      }
    }
    // WebP: RIFF header at 0, dimensions in VP8/VP8L chunk.
    if (buffer.length >= 30 && buffer.slice(0, 4).toString("ascii") === "RIFF") {
      const stride = buffer.readUInt16LE(20);
      const height = buffer.readUInt16LE(22);
      if (stride && height) return { width: stride & 0x3fff, height };
    }
  } catch {
    // fall through to null
  }
  return null;
}

function isOpenAiEditEligible(input: XiangsuGenerateInput): boolean {
  if (!env.OPENAI_API_KEY) return false;
  // OpenAI images.edit supports a single base image + optional mask. Only
  // A/B test when there's exactly one reference image (the base) so the
  // request shape matches.
  return input.references.filter((r) => r.kind === "image").length === 1;
}

export function createXiangsuImageGenerator({
  apiKey,
  fetcher = fetch,
}: XiangsuGeneratorOptions) {
  return async function generateImage(
    input: XiangsuGenerateInput,
    requestSignal?: AbortSignal,
  ): Promise<XiangsuGenerateOutput> {
    const useOpenAi = env.OPENAI_API_KEY && isOpenAiEditEligible(input);
    const effectiveApiKey = useOpenAi ? env.OPENAI_API_KEY : apiKey;
    if (!effectiveApiKey) {
      throw new Error("AI generation is disabled. Set XIANGSU_API_KEY or OPENAI_API_KEY in .env.local.");
    }

    if (!xiangsuImageModelIdSchema.safeParse(input.model).success) {
      throw new Error("This model is not supported by Xiangsu image generation. Use GPT Image 2.");
    }

    const controller = new AbortController();
    const abortFromRequest = () => controller.abort(requestSignal?.reason);
    if (requestSignal?.aborted) {
      abortFromRequest();
    } else {
      requestSignal?.addEventListener("abort", abortFromRequest, { once: true });
    }
    try {
      let compiled = compileReferencePrompt(input.prompt, input.references);
      const ordered = orderedReferences(input.prompt, referencesForProvider(input.references));
      const diagnosticsRef: { current?: XiangsuGenerateDiagnostics } = {};

      if (compiled.imageUrls.length > 0 && isDallEModel(input.model)) {
        throw new Error(
          "DALL-E models do not support reference-image editing. Use a GPT Image model.",
        );
      }

      const isGptModel = isGptImageModel(input.model);
      const isGemini = isGeminiImageModel(input.model);
      const gptQuality = gptImageQualityForResolution(input.resolution);
      const gptSize = gptImageSizeForResolution(input.size, input.resolution);
      const gptOutputFormat: ImageGenerationOutputFormat = isGptModel ? "png" : input.outputFormat;

      const systemPrompt = input.systemPrompt?.trim();
      const basePrompt = systemPrompt ? `${systemPrompt}\n\n${compiled.prompt}` : compiled.prompt;
      const specSuffix = imageOutputSpecLine({
        isGptModel,
        matchSourceSize: input.matchSourceSize,
        size: input.size,
        resolution: input.resolution,
      });
      const promptWithSpec = `${basePrompt}${specSuffix}`;

      const response = isGemini
        ? await fetcher(`${XIANGSU_GEMINI_BASE_URL}/${input.model}:generateContent`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: await geminiParts(
                    basePrompt,
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
        : compiled.imageUrls.length > 0 && isGptModel
          ? await (async () => {
              // Detect the two-pass scenario: a mask is attached AND there
              // were additional image references that got dropped by
              // compileReferencePrompt (e.g. a supplier texture image like
              // @elastic). In that case we run a two-pass pipeline.
              const droppedImageRefs = ordered.filter(
                (reference) =>
                  reference.source === "image" &&
                  !compiled.imageUrls.includes(reference.url) &&
                  reference !== ordered.find((r) => r.maskUrl),
              );
              const twoPassEligible = Boolean(compiled.maskUrl) && droppedImageRefs.length > 0;

              if (twoPassEligible) {
                return await runTwoPassMaskEdit(
                  input,
                  compiled,
                  ordered,
                  droppedImageRefs,
                  promptWithSpec,
                  gptQuality,
                  gptSize,
                  gptOutputFormat,
                  apiKey,
                  fetcher,
                  controller.signal,
                  diagnosticsRef,
                );
              }

              const form = new FormData();
              form.append("model", input.model);
              form.append("prompt", promptWithSpec);
              form.append("n", "1");
              form.append("quality", gptQuality);
              form.append("response_format", "b64_json");
              form.append("output_format", gptOutputFormat);
              const firstImageDimensions = await appendEditImages(
                form,
                compiled.imageUrls,
                fetcher,
                controller.signal,
              );
              if (compiled.maskUrl) {
                const maskBlob = await blobFromReferenceUrl(
                  compiled.maskUrl,
                  fetcher,
                  controller.signal,
                );
                const maskDimensions = await imageDimensions(maskBlob);
                if (
                  firstImageDimensions &&
                  maskDimensions &&
                  (firstImageDimensions.width !== maskDimensions.width ||
                    firstImageDimensions.height !== maskDimensions.height)
                ) {
                  throw new Error(
                    `Mask dimensions (${maskDimensions.width}x${maskDimensions.height}) don't match the source image (${firstImageDimensions.width}x${firstImageDimensions.height}). Redraw the mask on the current variant.`,
                  );
                }
                form.append("mask", maskBlob, "mask.png");
                if (input.matchSourceSize && firstImageDimensions) {
                  form.append("size", `${firstImageDimensions.width}x${firstImageDimensions.height}`);
                } else {
                  form.append("size", gptSize);
                }
              } else {
                form.append("size", gptSize);
              }

              // Build diagnostics so the user can audit exactly what was sent.
              const resolvedReferences: XiangsuGenerateDiagnostics["resolvedReferences"] =
                compiled.imageUrls.map((url, index) => {
                  const alias = ordered[index]?.alias ?? `image-${index + 1}`;
                  const isBaseWithMask = index === 0 && Boolean(compiled.maskUrl);
                  return {
                    alias,
                    role: isBaseWithMask
                      ? "base-image-with-mask"
                      : "reference-image",
                    imageUrl: url,
                    maskUrl: isBaseWithMask ? compiled.maskUrl : undefined,
                    description: ordered[index]?.description,
                  };
                });
              const formFields: Record<string, string> = {
                model: input.model,
                prompt: promptWithSpec,
                n: "1",
                quality: gptQuality,
                response_format: "b64_json",
                output_format: gptOutputFormat,
              };
              for (let index = 0; index < compiled.imageUrls.length; index += 1) {
                formFields[`image[${index}]`] = compiled.imageUrls[index];
              }
              formFields.size = String(form.get("size") ?? "");
              if (compiled.maskUrl) formFields.mask = compiled.maskUrl;

              (diagnosticsRef as { current?: XiangsuGenerateDiagnostics }).current = {
                compiledPrompt: promptWithSpec,
                resolvedReferences,
                formFields,
              };

              const editUrl = env.OPENAI_API_KEY
                ? `${env.OPENAI_BASE_URL ?? "https://api.openai.com"}/v1/images/edits`
                : XIANGSU_EDIT_URL;
              const editAuth = env.OPENAI_API_KEY
                ? `Bearer ${env.OPENAI_API_KEY}`
                : `Bearer ${apiKey}`;

              return fetcher(editUrl, {
                method: "POST",
                headers: {
                  Authorization: editAuth,
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
                prompt: promptWithSpec,
                n: 1,
                size: gptSize,
                quality: gptQuality,
                response_format: "b64_json",
                output_format: gptOutputFormat,
                ...(compiled.imageUrls.length > 0
                  ? {
                      image_urls: compiled.imageUrls,
                      content: promptContent(promptWithSpec, compiled.imageUrls),
                    }
                  : {}),
              }),
              signal: controller.signal,
            });

      let payload: unknown;
      try {
        if (response instanceof Response) {
          payload = await response.json();
        } else {
          // Two-pass path already produced a final result — return it directly.
          return response;
        }
      } catch {
        throw new Error("The image provider returned an invalid response.");
      }

      if (!(response instanceof Response) || !response.ok) {
        if (!(response instanceof Response)) {
          throw new Error("The image provider did not return a usable response.");
        }
        const message = providerErrorMessage(payload) ?? "The image provider rejected the request.";
        throw new Error(sanitizeMessage(message, effectiveApiKey ?? ""));
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
        return {
          url: `data:${inline.mimeType};base64,${inline.data}`,
          model: input.model,
          diagnostics: diagnosticsRef.current,
        };
      }

      const parsed = providerSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("The image provider did not return an image.");
      }

      const list =
        parsed.data.data ??
        parsed.data.result ??
        parsed.data.output ??
        parsed.data.images ??
        parsed.data.image ??
        [];
      const image = list[0];
      if (!image) throw new Error("The image provider did not return an image.");

      const imageUrl =
        (typeof image.image_url === "string" ? image.image_url : image.image_url?.url) ??
        image.url ??
        image.result_url ??
        image.output_url;
      const url = imageUrl ?? (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
      if (!url) throw new Error("The image provider did not return an image.");
      return { url, model: input.model, diagnostics: diagnosticsRef.current };
    } catch (error) {
      if (isAbortError(error)) {
        if (requestSignal?.aborted) {
          throw requestSignal.reason instanceof Error
            ? requestSignal.reason
            : new DOMException("Generation cancelled", "AbortError");
        }
        throw new Error("Image generation was aborted. Please try again.");
      }
      if (isNetworkFetchError(error)) {
        throw new Error(
          "The image provider connection failed. Please retry, or switch to GPT Image 2 / 1.5 Pro.",
        );
      }
      throw error;
    } finally {
      requestSignal?.removeEventListener("abort", abortFromRequest);
    }
  };
}

/**
 * Run a single GPT-image edit call. Returns the fetched image bytes
 * (PNG/JPEG/WebP) decoded from the provider response.
 */
async function callGptImageEdit(
  editUrl: string,
  authHeader: string,
  form: FormData,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetcher(editUrl, {
    method: "POST",
    headers: { Authorization: authHeader },
    body: form,
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The image provider returned an invalid response.");
  }
  if (!response.ok) {
    const message = providerErrorMessage(payload) ?? "The image provider rejected the request.";
    throw new Error(message);
  }

  const parsed = providerSuccessSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("The image provider did not return an image.");
  }
  const list =
    parsed.data.data ??
    parsed.data.result ??
    parsed.data.output ??
    parsed.data.images ??
    parsed.data.image ??
    [];
  const image = list[0];
  if (!image) throw new Error("The image provider did not return an image.");
  const b64 = image.b64_json ?? null;
  const remoteUrl =
    (typeof image.image_url === "string" ? image.image_url : image.image_url?.url) ??
    image.url ??
    image.result_url ??
    image.output_url;

  if (b64) {
    return { buffer: Buffer.from(b64, "base64"), mimeType: "image/png" };
  }
  if (remoteUrl) {
    const imgRes = await fetcher(remoteUrl, { signal });
    if (!imgRes.ok) {
      throw new Error(`Download of generated image failed (${imgRes.status}).`);
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get("content-type") ?? "image/png";
    return { buffer: buf, mimeType };
  }
  throw new Error("The image provider did not return an image.");
}

/**
 * Two-pass mask edit pipeline.
 *
 * Pass 1: single base image + mask → inpaint a neutral material into the mask
 *         region (API honors the mask because there's only one image).
 * Composite: paste pass-1's mask region onto the original base → no bleed.
 * Pass 2: composited image + dropped texture image (no mask) → model transfers
 *         the texture into the "highlighted" region.
 * Composite: paste pass-2's mask region onto the original base again → final
 *         image, pixel-identical to the base outside the mask.
 */
async function runTwoPassMaskEdit(
  input: XiangsuGenerateInput,
  _compiled: ReturnType<typeof compileReferencePrompt>,
  ordered: ProviderImageReference[],
  droppedImageRefs: ProviderImageReference[],
  _promptWithSpec: string,
  gptQuality: string,
  gptSize: string,
  _gptOutputFormat: ImageGenerationOutputFormat,
  apiKey: string | undefined,
  fetcher: typeof fetch,
  signal: AbortSignal,
  diagnosticsRef: { current?: XiangsuGenerateDiagnostics },
): Promise<{ url: string; model: ImageGenerationModelId; diagnostics?: XiangsuGenerateDiagnostics }> {
  const maskCarrier = ordered.find((reference) => reference.maskUrl);
  if (!maskCarrier || !maskCarrier.url || !maskCarrier.maskUrl) {
    throw new Error("Two-pass edit requires a base image with a mask.");
  }

  const editUrl = env.OPENAI_API_KEY
    ? `${env.OPENAI_BASE_URL ?? "https://api.openai.com"}/v1/images/edits`
    : XIANGSU_EDIT_URL;
  const editAuth = env.OPENAI_API_KEY
    ? `Bearer ${env.OPENAI_API_KEY}`
    : `Bearer ${apiKey}`;

  // --- Pass 1: base + mask, generic material inpaint -----------------------
  const pass1Prompt = [
    "Reference image mapping:",
    `- Provider image 1 is @${maskCarrier.alias}: the base image to edit.`,
    "",
    "User instruction:",
    `Inpaint the masked (transparent) region of @${maskCarrier.alias} with a neutral placeholder material — a plain woven fabric texture, mid-gray, matte finish, soft top-lit. Match the lighting and shadow direction of @${maskCarrier.alias}.`,
    "",
    "MASK CONSTRAINT (HARD — must be obeyed exactly):",
    `- An alpha-channel mask is attached. FULLY TRANSPARENT pixels (alpha=0) are the ONLY pixels you may modify. FULLY OPAQUE pixels (alpha=255) MUST remain pixel-identical to @${maskCarrier.alias}.`,
    `- Do NOT expand the edit beyond the transparent area. Do NOT bleed or feather. The mask is an exact pixel selection.`,
    `- Keep every pixel outside the transparent area bit-for-bit unchanged.`,
    "",
    "图像输出规格：输出画幅与参考图1保持完全一致的尺寸和宽高比。",
  ].join("\n");

  const pass1Form = new FormData();
  pass1Form.append("model", input.model);
  pass1Form.append("prompt", pass1Prompt);
  pass1Form.append("n", "1");
  pass1Form.append("quality", gptQuality);
  pass1Form.append("response_format", "b64_json");
  pass1Form.append("output_format", "png");

  const baseBlob = await blobFromReferenceUrl(maskCarrier.url, fetcher, signal);
  pass1Form.append("image[]", baseBlob, "base.png");
  const baseDims = await imageDimensions(baseBlob);

  const maskBlob = await blobFromReferenceUrl(maskCarrier.maskUrl, fetcher, signal);
  const maskDims = await imageDimensions(maskBlob);
  if (
    baseDims &&
    maskDims &&
    (baseDims.width !== maskDims.width || baseDims.height !== maskDims.height)
  ) {
    throw new Error(
      `Mask dimensions (${maskDims.width}x${maskDims.height}) don't match the source image (${baseDims.width}x${baseDims.height}). Redraw the mask on the current variant.`,
    );
  }
  pass1Form.append("mask", maskBlob, "mask.png");
  if (input.matchSourceSize && baseDims) {
    pass1Form.append("size", `${baseDims.width}x${baseDims.height}`);
  } else {
    pass1Form.append("size", gptSize);
  }

  const pass1 = await callGptImageEdit(editUrl, editAuth, pass1Form, fetcher, signal);

  // --- Composite pass-1 mask region onto original base --------------------
  const baseBuffer = Buffer.from(await baseBlob.arrayBuffer());
  const maskBuffer = Buffer.from(await maskBlob.arrayBuffer());
  const composited1 = await compositeMaskedEdit(baseBuffer, pass1.buffer, maskBuffer);

  // --- Pass 2: composited1 + dropped texture image, no mask --------------
  // The model sees the pass-1 result (which has a neutral material where
  // the mask was) plus the real @elastic image. We ask it to replace the
  // neutral material region with @elastic's texture, keeping everything
  // else unchanged. No mask this time, so the API doesn't ignore it.
  const textureRef = droppedImageRefs[0];
  const textureUrl = textureRef?.url;
  if (!textureUrl) {
    throw new Error("Two-pass edit requires a texture reference image URL.");
  }

  const pass2Prompt = [
    "Reference image mapping:",
    `- Provider image 1 is @${maskCarrier.alias}: the base image — it already has a placeholder material in one region.`,
    `- Provider image 2 is @${textureRef.alias}: a real sample of the material to apply.`,
    "",
    "User instruction:",
    `Replace the placeholder material region in @${maskCarrier.alias} with the exact material, texture, color, weave, and sheen shown in @${textureRef.alias}.`,
    `Keep EVERYTHING else in @${maskCarrier.alias} pixel-identical: silhouette, background, lighting, print, logos, shadows, framing. Only the placeholder region should change.`,
    `Match the light direction, shadow, and tone of @${maskCarrier.alias} inside the new material region — do not introduce new lighting.`,
    "",
    "The placeholder region is the area that visibly differs from the rest of @${maskCarrier.alias} (a plain gray woven patch). Replace only that patch.",
    "",
    "图像输出规格：输出画幅与参考图1保持完全一致的尺寸和宽高比。",
  ].join("\n");

  const pass2Form = new FormData();
  pass2Form.append("model", input.model);
  pass2Form.append("prompt", pass2Prompt);
  pass2Form.append("n", "1");
  pass2Form.append("quality", gptQuality);
  pass2Form.append("response_format", "b64_json");
  pass2Form.append("output_format", "png");
  pass2Form.append("image[]", new Blob([new Uint8Array(composited1)], { type: "image/png" }), "base.png");
  const textureBlob = await blobFromReferenceUrl(textureUrl, fetcher, signal);
  pass2Form.append("image[]", textureBlob, "texture.png");
  if (input.matchSourceSize && baseDims) {
    pass2Form.append("size", `${baseDims.width}x${baseDims.height}`);
  } else {
    pass2Form.append("size", gptSize);
  }

  const pass2 = await callGptImageEdit(editUrl, editAuth, pass2Form, fetcher, signal);

  // --- Final composite: paste pass-2's mask region back onto original base
  const finalBuffer = await compositeMaskedEdit(baseBuffer, pass2.buffer, maskBuffer);

  // --- Diagnostics ------------------------------------------------------
  (diagnosticsRef as { current?: XiangsuGenerateDiagnostics }).current = {
    compiledPrompt: `--- PASS 1 (base + mask) ---\n${pass1Prompt}\n\n--- PASS 2 (composited + ${textureRef.alias}) ---\n${pass2Prompt}`,
    resolvedReferences: [
      {
        alias: maskCarrier.alias,
        role: "base-image-with-mask",
        imageUrl: maskCarrier.url,
        maskUrl: maskCarrier.maskUrl,
        description: maskCarrier.description,
      },
      ...droppedImageRefs.map((reference) => ({
        alias: reference.alias,
        role: "reference-image" as const,
        imageUrl: reference.url,
        description: reference.description,
      })),
    ],
    formFields: {
      "pass1.model": input.model,
      "pass1.prompt": pass1Prompt,
      "pass1.image[0]": maskCarrier.url,
      "pass1.mask": maskCarrier.maskUrl,
      "pass1.size": String(pass1Form.get("size") ?? ""),
      "pass2.model": input.model,
      "pass2.prompt": pass2Prompt,
      "pass2.image[0]": "(composited pass-1 result)",
      "pass2.image[1]": textureUrl,
      "pass2.size": String(pass2Form.get("size") ?? ""),
    },
  };

  // Upload final buffer to the persistent store so a URL is returned to the
  // client. Reuse the main /api/uploads route by posting the buffer as a
  // multipart file field — that route handles local Postgres + Supabase.
  const uploadForm = new FormData();
  uploadForm.append(
    "file",
    new Blob([new Uint8Array(finalBuffer)], { type: "image/png" }),
    "two-pass-result.png",
  );
  const uploadRes = await fetcher(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/uploads`,
    {
      method: "POST",
      body: uploadForm,
      signal,
    },
  ).catch(() => null);

  if (uploadRes && uploadRes.ok) {
    const body = (await uploadRes.json().catch(() => null)) as { url?: string } | null;
    if (body?.url) {
      return { url: body.url, model: input.model, diagnostics: diagnosticsRef.current };
    }
  }

  // Fallback: inline the result as a data URL (keeps response shape intact
  // even if the upload route isn't available / rejects server-side POSTs).
  const dataUrl = `data:image/png;base64,${finalBuffer.toString("base64")}`;
  return { url: dataUrl, model: input.model, diagnostics: diagnosticsRef.current };
}

export const generateXiangsuImage = createXiangsuImageGenerator({
  apiKey: env.XIANGSU_API_KEY,
});
