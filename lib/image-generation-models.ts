import { z } from "zod";

export const IMAGE_GENERATION_MODEL_IDS = [
  "gpt-image-2",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
  "gemini-3-pro-image-preview-2K",
  "gemini-3-pro-image-preview-4K",
  "gemini-3.1-flash-image-preview",
  "gemini-3.1-flash-image-preview-2K",
  "gemini-3.1-flash-image-preview-4K",
] as const;

export const imageGenerationModelIdSchema = z.enum(IMAGE_GENERATION_MODEL_IDS);
export type ImageGenerationModelId = z.infer<typeof imageGenerationModelIdSchema>;

export const imageGenerationResponseSchema = z.object({
  url: z.string().min(1),
  model: imageGenerationModelIdSchema,
});

export const imageGenerationErrorSchema = z.object({
  error: z.string().min(1),
});

export const MAX_IMAGE_GENERATION_REFERENCES = 14;

export const imageReferenceUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:";
      } catch {
        return false;
      }
    },
    { message: "Reference image must be an HTTP(S) URL or data URL." },
  );

export const imageGenerationReferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    alias: z.string().trim().min(1).max(80),
    url: imageReferenceUrlSchema,
  }),
  z.object({
    kind: z.literal("pantone"),
    alias: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
]);

export type ImageGenerationReference = z.infer<typeof imageGenerationReferenceSchema>;

export const imageGenerationRequestSchema = z.object({
  model: imageGenerationModelIdSchema,
  prompt: z.string().min(1).max(2000),
  references: z
    .array(imageGenerationReferenceSchema)
    .max(MAX_IMAGE_GENERATION_REFERENCES)
    .optional()
    .default([]),
});

export const DEFAULT_IMAGE_GENERATION_MODEL: ImageGenerationModelId = "gpt-image-2";

export type ModelCapability = "image" | "text" | "video";
export type ModelFamily = "gemini-image" | "gpt-image" | "gpt-text" | "deepseek" | "seedance";

export interface ModelCatalogEntry {
  id: string;
  officialName: string;
  aliases: readonly string[];
  family: ModelFamily;
  capability: ModelCapability;
  enabled: boolean;
}

export interface ModelCatalogGroup {
  id: ModelFamily;
  label: string;
  entries: readonly ModelCatalogEntry[];
}

export const MODEL_CATALOG_GROUPS: readonly ModelCatalogGroup[] = [
  {
    id: "gemini-image",
    label: "Gemini Image Series",
    entries: [
      {
        id: "gemini-2.5-flash-image",
        officialName: "gemini-2.5-flash-image",
        aliases: ["Banana 1", "Nano Banana 1"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
      {
        id: "gemini-3-pro-image-preview",
        officialName: "gemini-3-pro-image-preview",
        aliases: ["Banana Pro", "Nano Banana Pro"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
      {
        id: "gemini-3-pro-image-preview-2K",
        officialName: "gemini-3-pro-image-preview-2K",
        aliases: ["Banana Pro", "Nano Banana Pro"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
      {
        id: "gemini-3-pro-image-preview-4K",
        officialName: "gemini-3-pro-image-preview-4K",
        aliases: ["Banana Pro", "Nano Banana Pro"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
      {
        id: "gemini-3.1-flash-image-preview",
        officialName: "gemini-3.1-flash-image-preview",
        aliases: ["Banana 2", "Nano Banana 2"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
      {
        id: "gemini-3.1-flash-image-preview-2K",
        officialName: "gemini-3.1-flash-image-preview-2K",
        aliases: ["Banana 2", "Nano Banana 2"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
      {
        id: "gemini-3.1-flash-image-preview-4K",
        officialName: "gemini-3.1-flash-image-preview-4K",
        aliases: ["Banana 2", "Nano Banana 2"],
        family: "gemini-image",
        capability: "image",
        enabled: true,
      },
    ],
  },
  {
    id: "gpt-image",
    label: "GPT Image Series",
    entries: [
      {
        id: "gpt-image-2",
        officialName: "gpt-image-2",
        aliases: ["DALL-E 3", "GPT Image V2"],
        family: "gpt-image",
        capability: "image",
        enabled: true,
      },
    ],
  },
  {
    id: "gpt-text",
    label: "GPT Text Series",
    entries: [
      {
        id: "gpt-5.2",
        officialName: "gpt-5.2",
        aliases: ["GPT5 Standard"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.3-codex",
        officialName: "gpt-5.3-codex",
        aliases: ["GPT5 Code"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.4",
        officialName: "gpt-5.4",
        aliases: ["GPT5 Lite", "GPT5 Fast"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.4-mini",
        officialName: "gpt-5.4-mini",
        aliases: ["GPT5 Mini"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.4-xhigh",
        officialName: "gpt-5.4-xhigh",
        aliases: ["GPT5 High Speed"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.5",
        officialName: "gpt-5.5",
        aliases: ["GPT5 Mid"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.5-xhigh",
        officialName: "gpt-5.5-xhigh",
        aliases: ["GPT5 Ultra High"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.6-sol",
        officialName: "gpt-5.6-sol",
        aliases: ["GPT5 Sol", "Solar"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
      {
        id: "gpt-5.6-terra",
        officialName: "gpt-5.6-terra",
        aliases: ["GPT5 Terra", "Earth"],
        family: "gpt-text",
        capability: "text",
        enabled: false,
      },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek Series",
    entries: [
      {
        id: "deepseek-v3.1",
        officialName: "deepseek-v3.1",
        aliases: ["DeepSeek V3 Base"],
        family: "deepseek",
        capability: "text",
        enabled: false,
      },
      {
        id: "deepseek-v3.2",
        officialName: "deepseek-v3.2",
        aliases: ["DeepSeek V3 Base"],
        family: "deepseek",
        capability: "text",
        enabled: false,
      },
      {
        id: "deepseek-v4-flash",
        officialName: "deepseek-v4-flash",
        aliases: ["DeepSeek Flash"],
        family: "deepseek",
        capability: "text",
        enabled: false,
      },
      {
        id: "deepseek-v4-pro",
        officialName: "deepseek-v4-pro",
        aliases: ["DeepSeek Pro"],
        family: "deepseek",
        capability: "text",
        enabled: false,
      },
    ],
  },
  {
    id: "seedance",
    label: "Video Series",
    entries: [
      {
        id: "mg-seedance2.0",
        officialName: "mg-seedance2.0 (all variants)",
        aliases: ["Seedance 2", "MG Video V2"],
        family: "seedance",
        capability: "video",
        enabled: false,
      },
    ],
  },
] as const;

export const MODEL_CATALOG = MODEL_CATALOG_GROUPS.flatMap((group) => group.entries);

export function normalizeImageGenerationModel(value: unknown): ImageGenerationModelId {
  const parsed = imageGenerationModelIdSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_IMAGE_GENERATION_MODEL;
}

export function getModelCatalogEntry(model: ImageGenerationModelId): ModelCatalogEntry {
  const entry = MODEL_CATALOG.find((candidate) => candidate.id === model);
  if (!entry) throw new Error(`Missing model catalog entry for ${model}.`);
  return entry;
}
