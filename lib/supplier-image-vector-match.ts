import "server-only";

import sharp from "sharp";

import { env } from "@/lib/env";
import {
  createInMemoryVectorCollection,
  embedRgbRaw,
  IMAGE_VECTOR_EMBED_SIZE,
  type ImageVector,
} from "@/lib/image-vector-search";
import {
  SUPPLIER_MATCH_MODEL,
  supplierImageMatchRequestSchema,
  type SupplierImageMatchRequest,
  type SupplierImageMatchResponse,
} from "@/lib/supplier-image-match";

const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PARALLEL_EMBEDS = 6;

export type SupplierImageMatcher = (
  input: SupplierImageMatchRequest,
  signal?: AbortSignal,
) => Promise<SupplierImageMatchResponse>;

export type ImageEmbedder = (
  source: string,
  signal?: AbortSignal,
) => Promise<ImageVector>;

interface SupplierImageVectorMatcherOptions {
  embedImage?: ImageEmbedder;
  fetcher?: typeof fetch;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized.endsWith(".local")) {
    return true;
  }
  if (/^(?:127|10)\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)) return true;
  return /^(?:0\.0\.0\.0|169\.254\.169\.254)$/.test(normalized);
}

function isConfiguredLocalImageUrl(url: URL): boolean {
  const configuredOrigins = [env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SUPABASE_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
  if (!configuredOrigins.includes(url.origin)) return false;
  return (
    url.pathname.startsWith("/api/uploads/") ||
    url.pathname.includes("/storage/v1/object/public/uploads/")
  );
}

function assertSafeRemoteImageUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Supplier catalog images must use HTTP(S).");
  }
  if (isPrivateHostname(url.hostname) && !isConfiguredLocalImageUrl(url)) {
    throw new Error("A supplier catalog image points to a private network address.");
  }
  return url;
}

function bufferFromDataUrl(value: string): Buffer {
  const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match?.[2]) throw new Error("Image data URL is invalid.");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("An image is empty or exceeds 12 MB.");
  }
  return buffer;
}

async function fetchRemoteImage(
  source: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<Buffer> {
  let url = assertSafeRemoteImageUrl(source);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetcher(url, { signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) throw new Error("Image redirect could not be read.");
      url = assertSafeRemoteImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image request failed with ${response.status}.`);
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (
      contentType &&
      contentType !== "application/octet-stream" &&
      !/^image\/(?:png|jpe?g|webp|gif)$/i.test(contentType)
    ) {
      throw new Error("A supplier catalog URL did not return a supported image.");
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error("A supplier catalog image exceeds 12 MB.");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error("A supplier catalog image is empty or exceeds 12 MB.");
    }
    return buffer;
  }
  throw new Error("Image redirect limit exceeded.");
}

export async function embedImageSource(
  source: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ImageVector> {
  signal?.throwIfAborted();
  const sourceBuffer = source.startsWith("data:")
    ? bufferFromDataUrl(source)
    : await fetchRemoteImage(source, fetcher, signal);

  const { data, info } = await sharp(sourceBuffer, { animated: false })
    .rotate()
    .resize(IMAGE_VECTOR_EMBED_SIZE, IMAGE_VECTOR_EMBED_SIZE, {
      fit: "fill",
      withoutEnlargement: false,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  signal?.throwIfAborted();
  if (info.channels < 3) {
    throw new Error("Image embedding requires an RGB image.");
  }
  return embedRgbRaw(data, IMAGE_VECTOR_EMBED_SIZE);
}

async function mapWithConcurrency<T, Result>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await operation(value, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

/**
 * Embed the query + selected-supplier catalog, insert into an in-memory vector
 * collection, then rank by cosine similarity (highest first).
 */
export async function runSupplierImageVectorSearch(
  input: SupplierImageMatchRequest,
  embedImage: ImageEmbedder,
  signal?: AbortSignal,
): Promise<SupplierImageMatchResponse> {
  const queryVector = await embedImage(input.queryImage.url, signal);
  const catalogVectors = await mapWithConcurrency(
    input.catalog,
    MAX_PARALLEL_EMBEDS,
    async (item) => {
      const vector = await embedImage(item.imageUrl, signal);
      return { item, vector };
    },
  );

  const collection = createInMemoryVectorCollection(queryVector.length);
  for (const entry of catalogVectors) {
    collection.insert(entry.item.catalogItemId, entry.vector);
  }

  const hits = collection.search(queryVector);
  if (hits.length === 0) {
    throw new Error("No supplier catalog images could be indexed for search.");
  }

  return {
    matches: hits.map((hit) => ({
      catalogItemId: hit.id,
      similarity: hit.similarity,
      cosine: hit.cosine,
    })),
    searchedCount: input.catalog.length,
    model: SUPPLIER_MATCH_MODEL,
  };
}

export function createSupplierImageVectorMatcher({
  embedImage,
  fetcher = fetch,
}: SupplierImageVectorMatcherOptions = {}): SupplierImageMatcher {
  const resolveEmbed: ImageEmbedder =
    embedImage ?? ((source, signal) => embedImageSource(source, fetcher, signal));

  return async function matchSupplierImages(rawInput, signal) {
    const input = supplierImageMatchRequestSchema.parse(rawInput);
    return runSupplierImageVectorSearch(input, resolveEmbed, signal);
  };
}

export const matchSupplierImages = createSupplierImageVectorMatcher();
