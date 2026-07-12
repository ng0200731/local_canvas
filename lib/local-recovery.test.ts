import { beforeEach, describe, expect, it } from "vitest";

import {
  createLocalRecoveryArchive,
  importLocalRecoveryArchive,
  localRecoveryArchiveSchema,
} from "@/lib/local-recovery";

beforeEach(async () => {
  localStorage.clear();

  if ("indexedDB" in window) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("ica:workspace-record-store");
      request.onerror = () => resolve();
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
    });
  }
});

describe("local recovery", () => {
  it("exports version 2 archives with product variants", async () => {
    localStorage.setItem("ica:projects", JSON.stringify([]));
    localStorage.setItem("ica:canvases", JSON.stringify([]));
    localStorage.setItem("ica:images", JSON.stringify([]));
    localStorage.setItem("ica:workspace:customers", JSON.stringify([]));
    localStorage.setItem("ica:workspace:suppliers", JSON.stringify([]));
    localStorage.setItem(
      "ica:workspace:products",
      JSON.stringify([
        {
          id: "product-1",
          subject: "Indexed product",
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          supplierId: "supplier-1",
          productType: "woven-label",
          detail: "Has variants",
          variants: [
            {
              id: "variant-1",
              sortIndex: 0,
              material: "Polyester",
              colorNotes: "Black",
              parameters: {},
              unitPrice: "0.1",
              priceUnit: "per pc",
              image: {
                name: "label.webp",
                url: "https://example.com/label.webp",
                storagePath: null,
              },
            },
          ],
        },
      ]),
    );

    const archive = await createLocalRecoveryArchive();
    expect(archive.version).toBe(2);
    expect(archive.products).toHaveLength(1);
    expect(archive.products[0]).toMatchObject({
      id: "product-1",
      supplierId: "supplier-1",
    });
  });

  it("accepts legacy version 1 archives when importing", async () => {
    const archive = await importLocalRecoveryArchive({
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      origin: "http://localhost:3000",
      projects: [],
      canvases: [],
      images: [],
      customers: [],
      suppliers: [],
      products: [
        {
          id: "product-legacy",
          updatedAt: "2026-01-01T00:00:00.000Z",
          subject: "Legacy product",
        },
      ],
    });

    expect(localRecoveryArchiveSchema.parse(archive).version).toBe(1);
    expect(localStorage.getItem("ica:workspace:products")).toContain("product-legacy");
  });
});
