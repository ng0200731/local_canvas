import { describe, expect, it } from "vitest";

import {
  MAX_SUPPLIER_MATCH_CATALOG_IMAGES,
  SUPPLIER_MATCH_LOCAL_MODEL,
  SUPPLIER_MATCH_MODEL,
  SUPPLIER_MATCH_PICTURE_SHERLOCK_MODEL,
  supplierImageMatchRequestSchema,
  supplierImageMatchResponseSchema,
  supplierMatchUploadMetadataSchema,
  type SupplierMatchCatalogItem,
} from "@/lib/supplier-image-match";

function catalogItem(index: number, supplierId = "supplier-1"): SupplierMatchCatalogItem {
  return {
    catalogItemId: `product-${index}:variant-${index}`,
    supplierId,
    supplierName: "Selected Supplier",
    productId: `product-${index}`,
    productSubject: `Product ${index}`,
    productType: "woven-label",
    variantId: `variant-${index}`,
    imageName: `image-${index}.png`,
    imageUrl: `https://images.example.com/image-${index}.png`,
    detail: "Soft woven label",
    material: "Polyester",
    colorNotes: "Black and white",
    parameters: { width: "30 mm" },
  };
}

describe("supplier image match contracts", () => {
  it("accepts a selected supplier catalog and ranked vector-search response", () => {
    const request = supplierImageMatchRequestSchema.parse({
      queryImage: {
        name: "reference.png",
        url: "data:image/png;base64,aW1hZ2U=",
      },
      catalog: [catalogItem(1)],
      currentSupplierId: "supplier-1",
    });
    const response = supplierImageMatchResponseSchema.parse({
      matches: [
        {
          catalogItemId: request.catalog[0]?.catalogItemId,
          similarity: 88.25,
          cosine: 0.765,
        },
      ],
      searchedCount: 1,
      model: SUPPLIER_MATCH_MODEL,
    });

    expect(request.catalog).toHaveLength(1);
    expect(response.matches[0]?.similarity).toBe(88.25);
    expect(response.model).toBe(SUPPLIER_MATCH_LOCAL_MODEL);
    expect(SUPPLIER_MATCH_MODEL).toBe(SUPPLIER_MATCH_LOCAL_MODEL);

    const clipResponse = supplierImageMatchResponseSchema.parse({
      matches: response.matches,
      searchedCount: 1,
      model: SUPPLIER_MATCH_PICTURE_SHERLOCK_MODEL,
    });
    expect(clipResponse.model).toBe(SUPPLIER_MATCH_PICTURE_SHERLOCK_MODEL);
    expect(SUPPLIER_MATCH_PICTURE_SHERLOCK_MODEL).toContain("picture-sherlock");
  });

  it("rejects images owned by a supplier other than the selected supplier", () => {
    const parsed = supplierImageMatchRequestSchema.safeParse({
      queryImage: { name: "reference.png", url: "https://images.example.com/reference.png" },
      catalog: [catalogItem(1, "supplier-2")],
      currentSupplierId: "supplier-1",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("selected supplier");
    }
  });

  it("rejects duplicate identifiers and oversized catalogs", () => {
    const duplicate = catalogItem(1);
    const duplicateResult = supplierImageMatchRequestSchema.safeParse({
      queryImage: { name: "reference.png", url: "https://images.example.com/reference.png" },
      catalog: [duplicate, duplicate],
      currentSupplierId: "supplier-1",
    });
    const oversizedResult = supplierImageMatchRequestSchema.safeParse({
      queryImage: { name: "reference.png", url: "https://images.example.com/reference.png" },
      catalog: Array.from({ length: MAX_SUPPLIER_MATCH_CATALOG_IMAGES + 1 }, (_, index) =>
        catalogItem(index),
      ),
      currentSupplierId: "supplier-1",
    });

    expect(duplicateResult.success).toBe(false);
    expect(oversizedResult.success).toBe(false);
  });

  it("validates upload file metadata before reading the file", () => {
    expect(
      supplierMatchUploadMetadataSchema.safeParse({
        name: "reference.svg",
        size: 200,
        type: "image/svg+xml",
      }).success,
    ).toBe(false);
    expect(
      supplierMatchUploadMetadataSchema.safeParse({
        name: "reference.webp",
        size: 12 * 1024,
        type: "image/webp",
      }).success,
    ).toBe(true);
  });
});
