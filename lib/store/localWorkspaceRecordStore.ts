import {
  customerRecordInputSchema,
  productRecordInputSchema,
  supplierRecordInputSchema,
  type CustomerRecord,
  type ProductRecord,
  type SupplierRecord,
} from "@/lib/workspace-records";

import type { WorkspaceRecordStore } from "./workspaceRecordStore";

const KEYS = {
  customers: "ica:workspace:customers",
  suppliers: "ica:workspace:suppliers",
  products: "ica:workspace:products",
} as const;

const nowISO = () => new Date().toISOString();
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function newestFirst<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function upsertRecord<T extends { id: string; createdAt: string; updatedAt: string }>(
  records: T[],
  id: string | null,
  build: (existing: T | null, timestamp: string) => T,
): T {
  const index = id ? records.findIndex((record) => record.id === id) : -1;
  const existing = index >= 0 ? records[index] : null;
  const record = build(existing, nowISO());

  if (index >= 0) {
    records[index] = record;
  } else {
    records.unshift(record);
  }

  return record;
}

export const localWorkspaceRecordStore: WorkspaceRecordStore = {
  async listCustomers() {
    return newestFirst(read<CustomerRecord[]>(KEYS.customers, []));
  },

  async upsertCustomer(id, input) {
    const parsed = customerRecordInputSchema.parse(input);
    const records = read<CustomerRecord[]>(KEYS.customers, []);
    const record = upsertRecord(records, id, (existing, timestamp) => ({
      id: existing?.id ?? id ?? uid(),
      company: parsed.company,
      employees: parsed.employees,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }));
    write(KEYS.customers, records);
    return record;
  },

  async listSuppliers() {
    return newestFirst(read<SupplierRecord[]>(KEYS.suppliers, []));
  },

  async upsertSupplier(id, input) {
    const parsed = supplierRecordInputSchema.parse(input);
    const records = read<SupplierRecord[]>(KEYS.suppliers, []);
    const record = upsertRecord(records, id, (existing, timestamp) => ({
      id: existing?.id ?? id ?? uid(),
      company: parsed.company,
      employees: parsed.employees,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }));
    write(KEYS.suppliers, records);
    return record;
  },

  async listProducts() {
    return newestFirst(read<ProductRecord[]>(KEYS.products, []));
  },

  async upsertProduct(id, input) {
    const parsed = productRecordInputSchema.parse(input);
    const records = read<ProductRecord[]>(KEYS.products, []);
    const record = upsertRecord(records, id, (existing, timestamp) => ({
      id: existing?.id ?? id ?? uid(),
      ...parsed,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }));
    write(KEYS.products, records);
    return record;
  },
};
