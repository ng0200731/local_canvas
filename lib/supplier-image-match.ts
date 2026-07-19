import { z } from "zod";

import { IMAGE_VECTOR_EMBEDDING_MODEL } from "@/lib/image-vector-search";
import { supplierProductTypes } from "@/lib/workspace-records";

export const MAX_SUPPLIER_MATCH_CATALOG_IMAGES = 100;
/** Local histogram/structure embedding used as the offline fallback. */
export const SUPPLIER_MATCH_LOCAL_MODEL = IMAGE_VECTOR_EMBEDDING_MODEL;
/** CLIP vision model used by the Picture Sherlock sidecar. */
export const SUPPLIER_MATCH_PICTURE_SHERLOCK_MODEL =
  "picture-sherlock-clip-vit-base-patch32" as const;
/** CLIP + Milvus Lite vector search used by the Milvus match sidecar. */
export const SUPPLIER_MATCH_MILVUS_MODEL = "milvus-clip-vit-base-patch32" as const;
export const SUPPLIER_MATCH_ENGINES = ["picture-sherlock", "milvus"] as const;
export type SupplierMatchEngine = (typeof SUPPLIER_MATCH_ENGINES)[number];
export const SUPPLIER_MATCH_MODELS = [
  SUPPLIER_MATCH_LOCAL_MODEL,
  SUPPLIER_MATCH_PICTURE_SHERLOCK_MODEL,
  SUPPLIER_MATCH_MILVUS_MODEL,
] as const;
/** @deprecated Prefer SUPPLIER_MATCH_LOCAL_MODEL / SUPPLIER_MATCH_MODELS. */
export const SUPPLIER_MATCH_MODEL = SUPPLIER_MATCH_LOCAL_MODEL;

const MAX_IMAGE_SOURCE_LENGTH = 8_000_000;

export const supplierMatchImageSourceSchema = z
  .string()
  .min(1, "Image URL is required.")
  .max(MAX_IMAGE_SOURCE_LENGTH, "Image data is too large.")
  .refine(
    (value) => {
      if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Image must be an HTTP(S) URL or a supported image data URL." },
  );

export const supplierMatchQueryImageSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    url: supplierMatchImageSourceSchema,
  })
  .strict();

export const supplierMatchCatalogItemSchema = z
  .object({
    catalogItemId: z.string().trim().min(1).max(240),
    supplierId: z.string().trim().min(1).max(120),
    supplierName: z.string().trim().min(1).max(240),
    productId: z.string().trim().min(1).max(120),
    productSubject: z.string().trim().min(1).max(300),
    productType: z.enum(supplierProductTypes),
    variantId: z.string().trim().min(1).max(120),
    imageName: z.string().trim().min(1).max(300),
    imageUrl: supplierMatchImageSourceSchema,
    detail: z.string().trim().max(1_500),
    material: z.string().trim().max(300),
    colorNotes: z.string().trim().max(300),
    parameters: z.record(z.string().trim().min(1).max(100), z.string().trim().max(300)),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.parameters).length > 30) {
      context.addIssue({
        code: "custom",
        path: ["parameters"],
        message: "A catalog item can include at most 30 parameters.",
      });
    }
  });

export const supplierImageMatchRequestSchema = z
  .object({
    queryImage: supplierMatchQueryImageSchema,
    catalog: z
      .array(supplierMatchCatalogItemSchema)
      .min(1, "Add at least one supplier product image before searching.")
      .max(
        MAX_SUPPLIER_MATCH_CATALOG_IMAGES,
        `Image search supports up to ${MAX_SUPPLIER_MATCH_CATALOG_IMAGES} supplier images at once.`,
      ),
    currentSupplierId: z.string().trim().min(1).max(120),
    /** Which reverse-image engine to use. Defaults to Picture Sherlock. */
    engine: z.enum(SUPPLIER_MATCH_ENGINES).default("picture-sherlock"),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, item] of value.catalog.entries()) {
      if (item.supplierId !== value.currentSupplierId) {
        context.addIssue({
          code: "custom",
          path: ["catalog", index, "supplierId"],
          message: "Catalog images must belong to the selected supplier.",
        });
      }
      if (ids.has(item.catalogItemId)) {
        context.addIssue({
          code: "custom",
          path: ["catalog", index, "catalogItemId"],
          message: "Catalog image identifiers must be unique.",
        });
      }
      ids.add(item.catalogItemId);
    }
  });

export const supplierImageMatchCandidateSchema = z
  .object({
    catalogItemId: z.string().trim().min(1).max(240),
    /** Comparative similarity score 0–100 (higher is closer). */
    similarity: z.number().finite().min(0).max(100),
    /** Cosine similarity in [-1, 1]. */
    cosine: z.number().finite().min(-1).max(1),
  })
  .strict();

export const supplierImageMatchResponseSchema = z
  .object({
    matches: z
      .array(supplierImageMatchCandidateSchema)
      .min(1)
      .max(MAX_SUPPLIER_MATCH_CATALOG_IMAGES),
    searchedCount: z.number().int().min(1).max(MAX_SUPPLIER_MATCH_CATALOG_IMAGES),
    model: z.enum(SUPPLIER_MATCH_MODELS),
  })
  .strict();

export const supplierImageMatchErrorSchema = z
  .object({ error: z.string().trim().min(1).max(1_000) })
  .strict();

export const supplierMatchUploadMetadataSchema = z
  .object({
    name: z.string().trim().min(1, "Choose an image file.").max(240),
    size: z
      .number()
      .int()
      .positive("The image file is empty.")
      .max(12 * 1024 * 1024, {
        message: "Choose an image smaller than 12 MB.",
      }),
    type: z.enum(["image/jpeg", "image/png", "image/webp"], {
      message: "Choose a JPG, PNG, or WebP image.",
    }),
  })
  .strict();

export type SupplierMatchQueryImage = z.infer<typeof supplierMatchQueryImageSchema>;
export type SupplierMatchCatalogItem = z.infer<typeof supplierMatchCatalogItemSchema>;
export type SupplierImageMatchRequest = z.infer<typeof supplierImageMatchRequestSchema>;
export type SupplierImageMatchCandidate = z.infer<typeof supplierImageMatchCandidateSchema>;
export type SupplierImageMatchResponse = z.infer<typeof supplierImageMatchResponseSchema>;
