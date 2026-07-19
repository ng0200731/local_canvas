import { describe, expect, it, vi } from "vitest";

import {
  SUPPLIER_MATCH_MODEL,
  type SupplierImageMatchRequest,
  type SupplierMatchCatalogItem,
} from "@/lib/supplier-image-match";
import {
  createSupplierImageVectorMatcher,
  runSupplierImageVectorSearch,
} from "@/lib/supplier-image-vector-match";
import {
  createInMemoryVectorCollection,
  embedRgbRaw,
  IMAGE_VECTOR_EMBED_SIZE,
  type ImageVector,
} from "@/lib/image-vector-search";

function solidRgb(r: number, g: number, b: number): Uint8Array {
  const size = IMAGE_VECTOR_EMBED_SIZE;
  const data = new Uint8Array(size * size * 3);
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 3;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
  return data;
}

function catalogItem(index: number, color: [number, number, number]): SupplierMatchCatalogItem {
  return {
    catalogItemId: `product-${index}:variant-${index}`,
    supplierId: "supplier-1",
    supplierName: "Selected Supplier",
    productId: `product-${index}`,
    productSubject: `Product ${index}`,
    productType: "woven-label",
    variantId: `variant-${index}`,
    imageName: `image-${index}.png`,
    imageUrl: `https://vector.test/${color.join(",")}.png`,
    detail: "Woven product",
    material: "Polyester",
    colorNotes: "Black",
    parameters: {},
  };
}

function requestFromColors(
  query: [number, number, number],
  catalogColors: Array<[number, number, number]>,
): SupplierImageMatchRequest {
  return {
    queryImage: { name: "reference.png", url: `https://vector.test/${query.join(",")}.png` },
    catalog: catalogColors.map((color, index) => catalogItem(index, color)),
    currentSupplierId: "supplier-1",
  };
}

function embedFromVectorUrl(source: string): ImageVector {
  const match = /^https:\/\/vector\.test\/(\d+),(\d+),(\d+)\.png$/.exec(source);
  if (!match) throw new Error(`Unexpected test image source: ${source}`);
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  return embedRgbRaw(solidRgb(r, g, b));
}

describe("supplier image vector matcher", () => {
  it("embeds the selected-supplier catalog and ranks by cosine similarity", async () => {
    const input = requestFromColors(
      [230, 30, 30],
      [
        [225, 32, 32],
        [20, 30, 220],
        [170, 75, 70],
      ],
    );

    const result = await runSupplierImageVectorSearch(input, async (source) =>
      embedFromVectorUrl(source),
    );

    expect(result.searchedCount).toBe(3);
    expect(result.model).toBe(SUPPLIER_MATCH_MODEL);
    expect(result.matches).toHaveLength(3);
    expect(result.matches[0]?.catalogItemId).toBe("product-0:variant-0");
    expect(result.matches.map((match) => match.similarity)).toEqual(
      [...result.matches.map((match) => match.similarity)].sort((a, b) => b - a),
    );
    expect(result.matches[0]!.similarity).toBeGreaterThan(result.matches.at(-1)!.similarity);
  });

  it("indexes every catalog vector before search", async () => {
    const vectors: ImageVector[] = [];
    const input = requestFromColors(
      [10, 10, 10],
      [
        [10, 10, 10],
        [250, 250, 250],
      ],
    );

    await runSupplierImageVectorSearch(input, async (source) => {
      const vector = embedFromVectorUrl(source);
      vectors.push(vector);
      return vector;
    });

    // query + 2 catalog images
    expect(vectors).toHaveLength(3);
    const collection = createInMemoryVectorCollection();
    collection.insert("a", vectors[1]!);
    collection.insert("b", vectors[2]!);
    expect(collection.search(vectors[0]!)[0]?.id).toBe("a");
  });

  it("uses the injected embedder and does not call external AI", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const match = createSupplierImageVectorMatcher({
      fetcher,
      embedImage: async (source) => embedFromVectorUrl(source),
    });

    const result = await match(
      requestFromColors(
        [120, 120, 20],
        [
          [110, 115, 25],
          [10, 10, 200],
        ],
      ),
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.matches[0]?.catalogItemId).toBe("product-0:variant-0");
    expect(result.searchedCount).toBe(2);
  });
});
