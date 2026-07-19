import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  createInMemoryVectorCollection,
  embedRgbRaw,
  IMAGE_VECTOR_DIMENSION,
  IMAGE_VECTOR_EMBED_SIZE,
  l2Normalize,
  similarityPercentFromCosine,
} from "@/lib/image-vector-search";

function solidRgb(r: number, g: number, b: number, size = IMAGE_VECTOR_EMBED_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 3);
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 3;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
  return data;
}

function halfSplitRgb(
  left: [number, number, number],
  right: [number, number, number],
  size = IMAGE_VECTOR_EMBED_SIZE,
): Uint8Array {
  const data = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 3;
      const color = x < size / 2 ? left : right;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
    }
  }
  return data;
}

describe("image vector search", () => {
  it("builds fixed-dimension unit embeddings from RGB images", () => {
    const vector = embedRgbRaw(solidRgb(220, 40, 40), IMAGE_VECTOR_EMBED_SIZE);
    expect(vector).toHaveLength(IMAGE_VECTOR_DIMENSION);
    const magnitude = Math.hypot(...Array.from(vector));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("ranks visually similar images above dissimilar ones", () => {
    const query = embedRgbRaw(solidRgb(230, 30, 30));
    const redLike = embedRgbRaw(solidRgb(200, 50, 40));
    const blueLike = embedRgbRaw(solidRgb(30, 40, 220));
    const split = embedRgbRaw(halfSplitRgb([20, 20, 20], [240, 240, 240]));

    const collection = createInMemoryVectorCollection();
    collection.insert("red", redLike);
    collection.insert("blue", blueLike);
    collection.insert("split", split);

    const hits = collection.search(query);
    expect(hits[0]?.id).toBe("red");
    expect(hits[0]!.similarity).toBeGreaterThan(hits.at(-1)!.similarity);
    expect(hits.every((hit, index) => index === 0 || hits[index - 1]!.cosine >= hit.cosine)).toBe(
      true,
    );
  });

  it("maps cosine similarity to a 0-100 percentage scale", () => {
    expect(similarityPercentFromCosine(1)).toBe(100);
    expect(similarityPercentFromCosine(0)).toBe(50);
    expect(similarityPercentFromCosine(-1)).toBe(0);
    const left = l2Normalize([1, 0, 0]);
    const right = l2Normalize([1, 0, 0]);
    expect(cosineSimilarity(left, right)).toBeCloseTo(1, 6);
  });
});
