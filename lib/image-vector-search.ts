/**
 * Towhee/Milvus-style reverse image search primitives.
 *
 * Pipeline:
 *   1) embed each image into a fixed visual feature vector
 *   2) insert catalog vectors into an in-memory collection
 *   3) search with cosine similarity, highest first
 *
 * This keeps supplier-scoped search self-contained (no external LLM JSON)
 * and works for the current catalog size (≤100 images per request).
 */

export const IMAGE_VECTOR_EMBEDDING_MODEL = "local-visual-embedding-v1" as const;
export const IMAGE_VECTOR_EMBED_SIZE = 48;
export const IMAGE_VECTOR_HIST_BINS = 16;
export const IMAGE_VECTOR_STRUCTURE_SIZE = 16;

/** Feature vector length for the local visual embedding. */
export const IMAGE_VECTOR_DIMENSION =
  IMAGE_VECTOR_HIST_BINS * 3 + // RGB histograms
  IMAGE_VECTOR_STRUCTURE_SIZE * IMAGE_VECTOR_STRUCTURE_SIZE + // luminance grid
  2; // gradient energy (horizontal + vertical)

export type ImageVector = Float32Array;

export interface VectorIndexEntry {
  id: string;
  vector: ImageVector;
}

export interface VectorSearchHit {
  id: string;
  /** Cosine similarity in [-1, 1]. */
  cosine: number;
  /** Comparative similarity percentage in [0, 100], higher is closer. */
  similarity: number;
}

export interface InMemoryVectorCollection {
  readonly dimension: number;
  readonly size: number;
  insert(id: string, vector: ImageVector): void;
  search(query: ImageVector, topK?: number): VectorSearchHit[];
}

function assertFiniteVector(vector: ArrayLike<number>, label: string): void {
  if (vector.length === 0) throw new Error(`${label} embedding is empty.`);
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];
    if (!Number.isFinite(value)) {
      throw new Error(`${label} embedding contains a non-finite value.`);
    }
  }
}

export function l2Normalize(vector: ArrayLike<number>): ImageVector {
  assertFiniteVector(vector, "Image");
  let sumSquares = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index] ?? 0;
    sumSquares += value * value;
  }
  const magnitude = Math.sqrt(sumSquares);
  const normalized = new Float32Array(vector.length);
  if (magnitude <= 1e-12) {
    // Degenerate images still need a unit direction so ranking stays defined.
    normalized[0] = 1;
    return normalized;
  }
  const inv = 1 / magnitude;
  for (let index = 0; index < vector.length; index += 1) {
    normalized[index] = (vector[index] ?? 0) * inv;
  }
  return normalized;
}

export function cosineSimilarity(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (left.length !== right.length) {
    throw new Error("Embedding dimensions do not match.");
  }
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }
  if (!Number.isFinite(dot)) throw new Error("Cosine similarity is not finite.");
  return Math.max(-1, Math.min(1, dot));
}

/** Map cosine [-1, 1] → comparative similarity percent [0, 100]. */
export function similarityPercentFromCosine(cosine: number): number {
  const clamped = Math.max(-1, Math.min(1, cosine));
  return Math.round(((clamped + 1) / 2) * 10_000) / 100;
}

/**
 * Build a compact visual embedding from raw RGB bytes of a square image.
 * Expected layout: length = size * size * 3, channels RGB, values 0-255.
 */
export function embedRgbRaw(data: Uint8Array | Buffer, size: number): ImageVector {
  if (size <= 0) throw new Error("Embedding size must be positive.");
  const pixelCount = size * size;
  if (data.length < pixelCount * 3) {
    throw new Error("RGB buffer is shorter than the declared image size.");
  }

  const hist = new Float32Array(IMAGE_VECTOR_HIST_BINS * 3);
  const luminance = new Float32Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 3;
    const r = (data[offset] ?? 0) / 255;
    const g = (data[offset + 1] ?? 0) / 255;
    const b = (data[offset + 2] ?? 0) / 255;

    const rBin = Math.min(IMAGE_VECTOR_HIST_BINS - 1, Math.floor(r * IMAGE_VECTOR_HIST_BINS));
    const gBin = Math.min(IMAGE_VECTOR_HIST_BINS - 1, Math.floor(g * IMAGE_VECTOR_HIST_BINS));
    const bBin = Math.min(IMAGE_VECTOR_HIST_BINS - 1, Math.floor(b * IMAGE_VECTOR_HIST_BINS));
    hist[rBin] += 1;
    hist[IMAGE_VECTOR_HIST_BINS + gBin] += 1;
    hist[IMAGE_VECTOR_HIST_BINS * 2 + bBin] += 1;

    luminance[index] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  for (let index = 0; index < hist.length; index += 1) {
    hist[index] = (hist[index] ?? 0) / pixelCount;
  }

  const structureSize = IMAGE_VECTOR_STRUCTURE_SIZE;
  const block = size / structureSize;
  const structure = new Float32Array(structureSize * structureSize);
  for (let y = 0; y < structureSize; y += 1) {
    for (let x = 0; x < structureSize; x += 1) {
      let sum = 0;
      let count = 0;
      const y0 = Math.floor(y * block);
      const y1 = Math.floor((y + 1) * block);
      const x0 = Math.floor(x * block);
      const x1 = Math.floor((x + 1) * block);
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          sum += luminance[py * size + px] ?? 0;
          count += 1;
        }
      }
      structure[y * structureSize + x] = count > 0 ? sum / count : 0;
    }
  }

  let horizontalEnergy = 0;
  let verticalEnergy = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const current = luminance[y * size + x] ?? 0;
      if (x + 1 < size) {
        const right = luminance[y * size + x + 1] ?? 0;
        const dx = current - right;
        horizontalEnergy += dx * dx;
      }
      if (y + 1 < size) {
        const below = luminance[(y + 1) * size + x] ?? 0;
        const dy = current - below;
        verticalEnergy += dy * dy;
      }
    }
  }
  const edgePairs = Math.max(1, size * (size - 1));
  horizontalEnergy = Math.sqrt(horizontalEnergy / edgePairs);
  verticalEnergy = Math.sqrt(verticalEnergy / edgePairs);

  const features = new Float32Array(IMAGE_VECTOR_DIMENSION);
  let cursor = 0;
  for (let index = 0; index < hist.length; index += 1, cursor += 1) {
    features[cursor] = hist[index] ?? 0;
  }
  for (let index = 0; index < structure.length; index += 1, cursor += 1) {
    features[cursor] = structure[index] ?? 0;
  }
  features[cursor] = horizontalEnergy;
  features[cursor + 1] = verticalEnergy;

  return l2Normalize(features);
}

export function createInMemoryVectorCollection(
  dimension = IMAGE_VECTOR_DIMENSION,
): InMemoryVectorCollection {
  const entries: VectorIndexEntry[] = [];

  return {
    dimension,
    get size() {
      return entries.length;
    },
    insert(id, vector) {
      if (!id.trim()) throw new Error("Vector id is required.");
      if (vector.length !== dimension) {
        throw new Error(`Expected embedding dimension ${dimension}, got ${vector.length}.`);
      }
      assertFiniteVector(vector, "Catalog");
      if (entries.some((entry) => entry.id === id)) {
        throw new Error(`Duplicate vector id: ${id}`);
      }
      entries.push({ id, vector: vector instanceof Float32Array ? vector : l2Normalize(vector) });
    },
    search(query, topK = entries.length) {
      if (query.length !== dimension) {
        throw new Error(`Expected query dimension ${dimension}, got ${query.length}.`);
      }
      assertFiniteVector(query, "Query");
      const limit = Math.max(0, Math.min(topK, entries.length));
      const hits = entries
        .map((entry) => {
          const cosine = cosineSimilarity(query, entry.vector);
          return {
            id: entry.id,
            cosine,
            similarity: similarityPercentFromCosine(cosine),
          } satisfies VectorSearchHit;
        })
        .sort((left, right) => {
          if (right.cosine !== left.cosine) return right.cosine - left.cosine;
          return left.id.localeCompare(right.id);
        });
      return hits.slice(0, limit);
    },
  };
}

export function rankCatalogByQueryVector(
  query: ImageVector,
  catalog: readonly VectorIndexEntry[],
): VectorSearchHit[] {
  const collection = createInMemoryVectorCollection(query.length);
  for (const entry of catalog) collection.insert(entry.id, entry.vector);
  return collection.search(query);
}
