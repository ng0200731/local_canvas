import "server-only";

import { z } from "zod";

import { env, type Env } from "@/lib/env";
import { similarityPercentFromCosine } from "@/lib/image-vector-search";
import {
  MAX_SUPPLIER_MATCH_CATALOG_IMAGES,
  SUPPLIER_MATCH_MILVUS_MODEL,
  supplierImageMatchRequestSchema,
  type SupplierImageMatchRequest,
  type SupplierImageMatchResponse,
} from "@/lib/supplier-image-match";
import {
  matchSupplierImages,
  type SupplierImageMatcher,
} from "@/lib/supplier-image-vector-match";

export const MILVUS_MATCH_MODEL = SUPPLIER_MATCH_MILVUS_MODEL;

export interface SupplierImageMilvusConfig {
  url: string;
  timeoutMs: number;
  fallbackToLocal: boolean;
}

interface MilvusMatcherOptions {
  fetcher?: typeof fetch;
  config?: SupplierImageMilvusConfig | null;
  fallbackMatcher?: SupplierImageMatcher;
}

const milvusMatchHitSchema = z
  .object({
    catalogItemId: z.string().trim().min(1).max(240),
    cosine: z.number().finite().min(-1).max(1),
  })
  .strict();

const milvusMatchResponseSchema = z
  .object({
    matches: z
      .array(milvusMatchHitSchema)
      .min(1)
      .max(MAX_SUPPLIER_MATCH_CATALOG_IMAGES),
    searchedCount: z.number().int().min(1).max(MAX_SUPPLIER_MATCH_CATALOG_IMAGES).optional(),
    model: z.literal(MILVUS_MATCH_MODEL).optional(),
  })
  .strict();

function normalizeEnvString(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length ? trimmed : undefined;
}

export function buildSupplierImageMilvusConfig(
  rawEnv: Pick<Env, "MILVUS_MATCH_URL" | "MILVUS_MATCH_TIMEOUT_MS" | "MILVUS_MATCH_FALLBACK_TO_LOCAL">,
): SupplierImageMilvusConfig | null {
  const url = normalizeEnvString(rawEnv.MILVUS_MATCH_URL);
  if (!url) return null;
  return {
    url,
    timeoutMs: rawEnv.MILVUS_MATCH_TIMEOUT_MS,
    fallbackToLocal: rawEnv.MILVUS_MATCH_FALLBACK_TO_LOCAL,
  };
}

function getConfiguredMilvusConfig(
  config: SupplierImageMilvusConfig | null | undefined,
): SupplierImageMilvusConfig | null {
  return config === undefined ? buildSupplierImageMilvusConfig(env) : config;
}

function resolveBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildSidecarBody(input: SupplierImageMatchRequest) {
  return {
    queryImage: { url: input.queryImage.url },
    catalog: input.catalog.map((item) => ({
      catalogItemId: item.catalogItemId,
      imageUrl: item.imageUrl,
    })),
    topK: input.catalog.length,
  };
}

function combineAbortSignals(
  left: AbortSignal | undefined,
  right: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!left) return right;
  if (!right) return left;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([left, right]);
  }
  const controller = new AbortController();
  const onAbort = () => {
    controller.abort(left.reason ?? right.reason);
  };
  if (left.aborted || right.aborted) {
    onAbort();
    return controller.signal;
  }
  left.addEventListener("abort", onAbort, { once: true });
  right.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

async function callMilvusMatch(
  fetcher: typeof fetch,
  config: SupplierImageMilvusConfig,
  input: SupplierImageMatchRequest,
  signal?: AbortSignal,
): Promise<SupplierImageMatchResponse> {
  const timeoutSignal =
    typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(config.timeoutMs)
      : undefined;
  const requestSignal = combineAbortSignals(signal, timeoutSignal);

  let response: Response;
  try {
    response = await fetcher(new URL("v1/match", resolveBaseUrl(config.url)), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(buildSidecarBody(input)),
      signal: requestSignal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Milvus match request timed out or was cancelled.");
    }
    const message = error instanceof Error ? error.message : "Milvus match is unreachable.";
    throw new Error(message);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Milvus match returned an unreadable response.");
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Milvus match request failed with ${response.status}.`;
    throw new Error(errorMessage);
  }

  const parsed = milvusMatchResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Milvus match returned an invalid match payload.");
  }

  const matches = parsed.data.matches
    .map((hit) => ({
      catalogItemId: hit.catalogItemId,
      cosine: hit.cosine,
      similarity: similarityPercentFromCosine(hit.cosine),
    }))
    .sort((left, right) => {
      if (right.cosine !== left.cosine) return right.cosine - left.cosine;
      return left.catalogItemId.localeCompare(right.catalogItemId);
    });

  if (matches.length === 0) {
    throw new Error("Milvus match returned no matches.");
  }

  return {
    matches,
    searchedCount: parsed.data.searchedCount ?? input.catalog.length,
    model: MILVUS_MATCH_MODEL,
  };
}

export function createSupplierImageMilvusMatcher({
  fetcher = fetch,
  config,
  fallbackMatcher,
}: MilvusMatcherOptions = {}): SupplierImageMatcher {
  const resolvedConfig = getConfiguredMilvusConfig(config);
  const resolveFallback: SupplierImageMatcher =
    fallbackMatcher ??
    (async (rawInput, signal) => matchSupplierImages(rawInput, signal));

  if (!resolvedConfig) {
    return async function localOnlyMatcher(rawInput, signal) {
      return resolveFallback(rawInput, signal);
    };
  }

  return async function matchSupplierImagesWithMilvusSidecar(rawInput, signal) {
    const input = supplierImageMatchRequestSchema.parse(rawInput);
    try {
      return await callMilvusMatch(fetcher, resolvedConfig, input, signal);
    } catch (error) {
      if (resolvedConfig.fallbackToLocal) {
        return resolveFallback(input, signal);
      }
      throw error;
    }
  };
}

export const matchSupplierImagesWithMilvus = createSupplierImageMilvusMatcher({
  fallbackMatcher: matchSupplierImages,
});
