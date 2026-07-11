import type {
  CustomerRecord,
  CustomerRecordInput,
  ProductRecord,
  ProductRecordInput,
  SupplierRecord,
  SupplierRecordInput,
} from "@/lib/workspace-records";

export interface WorkspaceRecordStore {
  listCustomers(): Promise<CustomerRecord[]>;
  upsertCustomer(id: string | null, input: CustomerRecordInput): Promise<CustomerRecord>;
  listSuppliers(): Promise<SupplierRecord[]>;
  upsertSupplier(id: string | null, input: SupplierRecordInput): Promise<SupplierRecord>;
  listProducts(): Promise<ProductRecord[]>;
  upsertProduct(id: string | null, input: ProductRecordInput): Promise<ProductRecord>;
}

export type WorkspaceRecordKind = "customer" | "supplier" | "product";
