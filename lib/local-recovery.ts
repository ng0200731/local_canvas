import { z } from "zod";

const storedRecordSchema = z
  .object({
    id: z.string().min(1),
    updatedAt: z.string().optional(),
  })
  .passthrough();

const canvasSchema = storedRecordSchema.extend({
  content: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }),
});

const localRecoveryArchiveV1Schema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  origin: z.string(),
  projects: z.array(storedRecordSchema),
  canvases: z.array(canvasSchema),
  images: z.array(storedRecordSchema),
  customers: z.array(storedRecordSchema),
  suppliers: z.array(storedRecordSchema),
  products: z.array(storedRecordSchema),
});

const localRecoveryArchiveV2Schema = localRecoveryArchiveV1Schema.extend({
  version: z.literal(2),
});

export const localRecoveryArchiveSchema = z.union([
  localRecoveryArchiveV1Schema,
  localRecoveryArchiveV2Schema,
]);

export type LocalRecoveryArchive = z.infer<typeof localRecoveryArchiveSchema>;

export const RECOVERY_KEYS = {
  projects: "ica:projects",
  canvases: "ica:canvases",
  images: "ica:images",
  customers: "ica:workspace:customers",
  suppliers: "ica:workspace:suppliers",
  products: "ica:workspace:products",
} as const;

const PRODUCT_DB_NAME = "ica:workspace-record-store";
const PRODUCT_DB_VERSION = 2;
const PRODUCT_STORE = "products";

type RecoverableCollection = keyof typeof RECOVERY_KEYS;

function parseCollection(raw: string | null): z.infer<typeof storedRecordSchema>[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return z.array(storedRecordSchema).parse(parsed);
}

function newerRecord<T extends z.infer<typeof storedRecordSchema>>(left: T, right: T): T {
  const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  return rightTime > leftTime ? right : left;
}

export function mergeRecoveryRecords<T extends z.infer<typeof storedRecordSchema>>(
  current: T[],
  incoming: T[],
): T[] {
  const merged = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) {
    const existing = merged.get(record.id);
    merged.set(record.id, existing ? newerRecord(existing, record) : record);
  }
  return [...merged.values()];
}

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

async function readIndexedCanvasContent(id: string): Promise<unknown | null> {
  if (!canUseIndexedDb()) return null;

  return new Promise((resolve) => {
    const request = indexedDB.open("ica:local-store", 2);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("canvasContent")) {
        db.close();
        resolve(null);
        return;
      }
      const transaction = db.transaction("canvasContent", "readonly");
      const readRequest = transaction.objectStore("canvasContent").get(id);
      readRequest.onerror = () => resolve(null);
      readRequest.onsuccess = () => {
        db.close();
        resolve(readRequest.result ?? null);
      };
    };
  });
}

async function openProductsDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return null;

  return new Promise((resolve) => {
    const request = indexedDB.open(PRODUCT_DB_NAME, PRODUCT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
        db.createObjectStore(PRODUCT_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readIndexedProducts(): Promise<z.infer<typeof storedRecordSchema>[]> {
  const db = await openProductsDb();
  if (!db) return [];

  try {
    return await new Promise((resolve) => {
      const request = db.transaction(PRODUCT_STORE, "readonly").objectStore(PRODUCT_STORE).getAll();
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result : [];
        resolve(z.array(storedRecordSchema).catch([]).parse(rows));
      };
    });
  } finally {
    db.close();
  }
}

async function writeIndexedProducts(records: z.infer<typeof storedRecordSchema>[]): Promise<void> {
  const db = await openProductsDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PRODUCT_STORE, "readwrite");
      const store = transaction.objectStore(PRODUCT_STORE);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to write product recovery data."));
      store.clear();
      for (const record of records) {
        store.put(record);
      }
    });
  } finally {
    db.close();
  }
}

async function readRecoveryProducts(): Promise<z.infer<typeof storedRecordSchema>[]> {
  const indexedProducts = await readIndexedProducts();
  if (indexedProducts.length > 0) return indexedProducts;
  return parseCollection(localStorage.getItem(RECOVERY_KEYS.products));
}

async function writeRecoveryProducts(records: z.infer<typeof storedRecordSchema>[]): Promise<void> {
  if (canUseIndexedDb()) {
    await writeIndexedProducts(records);
  }
  localStorage.setItem(RECOVERY_KEYS.products, JSON.stringify(records));
}

export async function createLocalRecoveryArchive(): Promise<LocalRecoveryArchive> {
  const collections = Object.fromEntries(
    await Promise.all(
      (Object.keys(RECOVERY_KEYS) as RecoverableCollection[]).map(async (name) => {
        if (name === "products") {
          return [name, await readRecoveryProducts()] as const;
        }
        return [name, parseCollection(localStorage.getItem(RECOVERY_KEYS[name]))] as const;
      }),
    ),
  ) as Record<RecoverableCollection, z.infer<typeof storedRecordSchema>[]>;

  const canvases = await Promise.all(
    collections.canvases.map(async (canvas) => {
      const indexedContent = await readIndexedCanvasContent(canvas.id);
      return indexedContent ? { ...canvas, content: indexedContent } : canvas;
    }),
  );

  return localRecoveryArchiveV2Schema.parse({
    version: 2,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    ...collections,
    canvases,
  });
}

export async function importLocalRecoveryArchive(value: unknown): Promise<LocalRecoveryArchive> {
  const archive = localRecoveryArchiveSchema.parse(value);
  for (const name of Object.keys(RECOVERY_KEYS) as RecoverableCollection[]) {
    if (name === "products") {
      const current = await readRecoveryProducts();
      await writeRecoveryProducts(mergeRecoveryRecords(current, archive.products));
      continue;
    }

    const current = parseCollection(localStorage.getItem(RECOVERY_KEYS[name]));
    const incoming = archive[name];
    localStorage.setItem(
      RECOVERY_KEYS[name],
      JSON.stringify(mergeRecoveryRecords(current, incoming)),
    );
  }
  return archive;
}
