import type {
  CustomerRecord,
  CustomerRecordInput,
  ProductRecord,
  ProductRecordInput,
  SupplierRecord,
  SupplierRecordInput,
} from "@/lib/workspace-records";
import type {
  GenericNodeDefinition,
  GenericNodeDefinitionInput,
  WorkspaceOption,
  WorkspaceOptionKind,
} from "@/lib/workspace-settings";

export interface WorkspaceRecordStore {
  listCustomers(): Promise<CustomerRecord[]>;
  upsertCustomer(id: string | null, input: CustomerRecordInput): Promise<CustomerRecord>;
  listSuppliers(): Promise<SupplierRecord[]>;
  upsertSupplier(id: string | null, input: SupplierRecordInput): Promise<SupplierRecord>;
  deleteSuppliers(ids: string[]): Promise<void>;
  listProducts(): Promise<ProductRecord[]>;
  upsertProduct(id: string | null, input: ProductRecordInput): Promise<ProductRecord>;
  getProduct(productId: string): Promise<ProductRecord | null>;
  listWorkspaceOptions(kind: WorkspaceOptionKind): Promise<WorkspaceOption[]>;
  replaceWorkspaceOptions(
    kind: WorkspaceOptionKind,
    options: WorkspaceOption[],
  ): Promise<WorkspaceOption[]>;
  listGenericNodeDefinitions(): Promise<GenericNodeDefinition[]>;
  upsertGenericNodeDefinition(
    id: string | null,
    input: GenericNodeDefinitionInput,
  ): Promise<GenericNodeDefinition>;
  deleteGenericNodeDefinition(id: string): Promise<void>;
  reorderGenericNodeDefinitions(orderedIds: string[]): Promise<GenericNodeDefinition[]>;
}

export type WorkspaceRecordKind = "customer" | "supplier" | "product";
