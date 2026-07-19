import { describe, expect, it, vi } from "vitest";

import { createSupplierImageMatchPostHandler } from "@/app/api/supplier-image-match/route";
import { SUPPLIER_MATCH_MODEL } from "@/lib/supplier-image-match";
import type { SupplierImageMatcher } from "@/lib/supplier-image-vector-match";

function post(body: unknown): Request {
  return new Request("http://localhost/api/supplier-image-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  queryImage: { name: "reference.png", url: "https://images.example.com/reference.png" },
  catalog: [
    {
      catalogItemId: "product-1:variant-1",
      supplierId: "supplier-1",
      supplierName: "Selected Supplier",
      productId: "product-1",
      productSubject: "Woven label",
      productType: "woven-label",
      variantId: "variant-1",
      imageName: "woven.png",
      imageUrl: "https://images.example.com/woven.png",
      detail: "Soft woven label",
      material: "Polyester",
      colorNotes: "Black",
      parameters: {},
    },
  ],
  currentSupplierId: "supplier-1",
};

describe("POST /api/supplier-image-match", () => {
  it("rejects cross-supplier catalogs before searching", async () => {
    const match = vi.fn<SupplierImageMatcher>();
    const handler = createSupplierImageMatchPostHandler({ match });
    const response = await handler(
      post({
        ...validBody,
        catalog: [{ ...validBody.catalog[0], supplierId: "supplier-2" }],
      }),
    );

    expect(response.status).toBe(400);
    expect(match).not.toHaveBeenCalled();
  });

  it("forwards the validated selected-supplier catalog", async () => {
    const match = vi.fn<SupplierImageMatcher>().mockResolvedValue({
      matches: [
        {
          catalogItemId: "product-1:variant-1",
          similarity: 91.5,
          cosine: 0.83,
        },
      ],
      searchedCount: 1,
      model: SUPPLIER_MATCH_MODEL,
    });
    const handler = createSupplierImageMatchPostHandler({ match });
    const response = await handler(post(validBody));

    expect(response.status).toBe(200);
    expect(match).toHaveBeenCalledWith(
      expect.objectContaining({ currentSupplierId: "supplier-1" }),
      expect.any(AbortSignal),
    );
    await expect(response.json()).resolves.toMatchObject({
      searchedCount: 1,
      model: SUPPLIER_MATCH_MODEL,
    });
  });

  it("maps provider failures to a 502 response", async () => {
    const handler = createSupplierImageMatchPostHandler({
      match: vi.fn<SupplierImageMatcher>().mockRejectedValue(new Error("Embedding failed")),
    });
    const response = await handler(post(validBody));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Embedding failed" });
  });

  it("still accepts a Picture Sherlock-backed matcher payload", async () => {
    const handler = createSupplierImageMatchPostHandler({
      match: vi.fn<SupplierImageMatcher>().mockResolvedValue({
        matches: [
          {
            catalogItemId: "product-1:variant-1",
            similarity: 91.5,
            cosine: 0.83,
          },
        ],
        searchedCount: 1,
        model: "picture-sherlock-clip-vit-base-patch32",
      }),
    });
    const response = await handler(post(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      searchedCount: 1,
      model: "picture-sherlock-clip-vit-base-patch32",
    });
  });
});
