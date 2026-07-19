import { describe, expect, it, vi } from "vitest";

import {
  SUPPLIER_MATCH_LOCAL_MODEL,
  SUPPLIER_MATCH_MILVUS_MODEL,
  type SupplierImageMatchRequest,
  type SupplierMatchCatalogItem,
} from "@/lib/supplier-image-match";
import {
  buildSupplierImageMilvusConfig,
  createSupplierImageMilvusMatcher,
  MILVUS_MATCH_MODEL,
} from "@/lib/supplier-image-milvus";
import type { SupplierImageMatcher } from "@/lib/supplier-image-vector-match";

function catalogItem(index: number): SupplierMatchCatalogItem {
  return {
    catalogItemId: `product-${index}:variant-${index}`,
    supplierId: "supplier-1",
    supplierName: "Selected Supplier",
    productId: `product-${index}`,
    productSubject: `Product ${index}`,
    productType: "woven-label",
    variantId: `variant-${index}`,
    imageName: `image-${index}.png`,
    imageUrl: `https://vector.test/${index}.png`,
    detail: "Woven product",
    material: "Polyester",
    colorNotes: "Red",
    parameters: {},
  };
}

function queryRequest(): SupplierImageMatchRequest {
  return {
    queryImage: { name: "reference.png", url: "https://vector.test/query.png" },
    catalog: [catalogItem(1), catalogItem(2)],
    currentSupplierId: "supplier-1",
    engine: "milvus",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("supplier image Milvus matcher", () => {
  it("builds a validated config and returns null when the URL is unset", () => {
    expect(
      buildSupplierImageMilvusConfig({
        MILVUS_MATCH_URL: undefined,
        MILVUS_MATCH_TIMEOUT_MS: 90_000,
        MILVUS_MATCH_FALLBACK_TO_LOCAL: true,
      }),
    ).toBeNull();

    const config = buildSupplierImageMilvusConfig({
      MILVUS_MATCH_URL: "http://127.0.0.1:8092",
      MILVUS_MATCH_TIMEOUT_MS: 45_000,
      MILVUS_MATCH_FALLBACK_TO_LOCAL: false,
    });
    expect(config).toEqual({
      url: "http://127.0.0.1:8092",
      timeoutMs: 45_000,
      fallbackToLocal: false,
    });
  });

  it("maps sidecar cosine scores and preserves ranking", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        matches: [
          { catalogItemId: "product-2:variant-2", cosine: 0.2 },
          { catalogItemId: "product-1:variant-1", cosine: 0.8 },
        ],
        searchedCount: 2,
        model: MILVUS_MATCH_MODEL,
      }),
    );

    const match = createSupplierImageMilvusMatcher({
      fetcher,
      config: {
        url: "http://127.0.0.1:8092",
        timeoutMs: 90_000,
        fallbackToLocal: false,
      },
    });

    const result = await match(queryRequest());

    expect(result.model).toBe(SUPPLIER_MATCH_MILVUS_MODEL);
    expect(result.matches).toEqual([
      {
        catalogItemId: "product-1:variant-1",
        cosine: 0.8,
        similarity: 90,
      },
      {
        catalogItemId: "product-2:variant-2",
        cosine: 0.2,
        similarity: 60,
      },
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:8092/v1/match");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      queryImage: { url: "https://vector.test/query.png" },
      catalog: [
        { catalogItemId: "product-1:variant-1", imageUrl: "https://vector.test/1.png" },
        { catalogItemId: "product-2:variant-2", imageUrl: "https://vector.test/2.png" },
      ],
      topK: 2,
    });
    expect(body.catalog[0]).not.toHaveProperty("supplierName");
  });

  it("falls back to the local matcher when the sidecar URL is disabled", async () => {
    const fallback = vi.fn<SupplierImageMatcher>().mockResolvedValue({
      matches: [
        {
          catalogItemId: "product-1:variant-1",
          cosine: 0.5,
          similarity: 75,
        },
      ],
      searchedCount: 2,
      model: SUPPLIER_MATCH_LOCAL_MODEL,
    });
    const fetcher = vi.fn<typeof fetch>();

    const match = createSupplierImageMilvusMatcher({
      config: null,
      fetcher,
      fallbackMatcher: fallback,
    });

    const result = await match(queryRequest());

    expect(result.model).toBe(SUPPLIER_MATCH_LOCAL_MODEL);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to local when the sidecar fails and fallback is enabled", async () => {
    const fallback = vi.fn<SupplierImageMatcher>().mockResolvedValue({
      matches: [
        {
          catalogItemId: "product-1:variant-1",
          cosine: 0.4,
          similarity: 70,
        },
      ],
      searchedCount: 2,
      model: SUPPLIER_MATCH_LOCAL_MODEL,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "model unavailable" }, 500),
    );

    const match = createSupplierImageMilvusMatcher({
      fetcher,
      config: {
        url: "http://127.0.0.1:8092",
        timeoutMs: 90_000,
        fallbackToLocal: true,
      },
      fallbackMatcher: fallback,
    });

    const result = await match(queryRequest());
    expect(result.model).toBe(SUPPLIER_MATCH_LOCAL_MODEL);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("rethrows when the sidecar fails and fallback is disabled", async () => {
    const match = createSupplierImageMilvusMatcher({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "boom" }, 500)),
      config: {
        url: "http://127.0.0.1:8092",
        timeoutMs: 90_000,
        fallbackToLocal: false,
      },
      fallbackMatcher: vi.fn(),
    });

    await expect(match(queryRequest())).rejects.toThrow("boom");
  });

  it("forwards the abort signal to the sidecar request", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      controller.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });

    const match = createSupplierImageMilvusMatcher({
      fetcher,
      config: {
        url: "http://127.0.0.1:8092",
        timeoutMs: 90_000,
        fallbackToLocal: false,
      },
    });

    await expect(match(queryRequest(), controller.signal)).rejects.toThrow(
      /timed out or was cancelled/i,
    );
  });
});
