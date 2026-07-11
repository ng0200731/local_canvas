import { z } from "zod";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  customerRecordInputSchema,
  productRecordInputSchema,
  supplierProductTypes,
  supplierRecordInputSchema,
  type CustomerRecord,
  type ProductImageInput,
  type ProductRecord,
  type SupplierProductType,
  type SupplierRecord,
} from "@/lib/workspace-records";

import type { WorkspaceRecordStore } from "./workspaceRecordStore";

const employeeRowSchema = z.object({
  id: z.string(),
  user_name: z.string(),
  email_prefix: z.string(),
  title: z.string(),
  tel: z.string(),
  sort_index: z.number().int(),
});

const customerRowSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  email_domain_suffix: z.string(),
  customer_type: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const supplierRowSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  email_domain_suffix: z.string(),
  product_types: z.array(z.enum(supplierProductTypes)),
  created_at: z.string(),
  updated_at: z.string(),
});

const productRowSchema = z.object({
  id: z.string(),
  subject: z.string(),
  detail: z.string(),
  material: z.string(),
  color_notes: z.string(),
  image_name: z.string().nullable(),
  image_url: z.string().nullable(),
  image_storage_path: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

function assertNoError<T extends { error: { message: string } | null }>(
  result: T,
  context: string,
): void {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapEmployees(value: unknown) {
  return toUnknownArray(value)
    .map((row) => employeeRowSchema.parse(row))
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((row) => ({
      id: row.id,
      userName: row.user_name,
      emailPrefix: row.email_prefix,
      title: row.title,
      tel: row.tel,
    }));
}

function imageFromRow(row: z.infer<typeof productRowSchema>): ProductImageInput | null {
  if (!row.image_name || !row.image_url) return null;
  return {
    name: row.image_name,
    url: row.image_url,
    storagePath: row.image_storage_path,
  };
}

function mapCustomer(rowValue: unknown, employeeRows: unknown): CustomerRecord {
  const row = customerRowSchema.parse(rowValue);
  return {
    id: row.id,
    company: {
      companyName: row.company_name,
      emailDomainSuffix: row.email_domain_suffix,
      type: row.customer_type,
    },
    employees: mapEmployees(employeeRows),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupplier(rowValue: unknown, employeeRows: unknown): SupplierRecord {
  const row = supplierRowSchema.parse(rowValue);
  return {
    id: row.id,
    company: {
      companyName: row.company_name,
      emailDomainSuffix: row.email_domain_suffix,
      productTypes: row.product_types as SupplierProductType[],
    },
    employees: mapEmployees(employeeRows),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProduct(rowValue: unknown): ProductRecord {
  const row = productRowSchema.parse(rowValue);
  return {
    id: row.id,
    subject: row.subject,
    detail: row.detail,
    material: row.material,
    colorNotes: row.color_notes,
    image: imageFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseWorkspaceRecordStore(): WorkspaceRecordStore {
  const supabase = getSupabaseBrowserClient();

  async function getCurrentUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    assertNoError({ error }, "getCurrentUser");
    if (!data.user) throw new Error("Sign in before saving to the database.");
    return data.user.id;
  }

  return {
    async listCustomers() {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, company_name, email_domain_suffix, customer_type, created_at, updated_at, customer_employees(id, user_name, email_prefix, title, tel, sort_index)",
        )
        .order("updated_at", { ascending: false });
      assertNoError({ error }, "listCustomers");
      return toUnknownArray(data).map((row) => {
        const record = row as { customer_employees?: unknown };
        return mapCustomer(record, record.customer_employees);
      });
    },

    async upsertCustomer(id, input) {
      const parsed = customerRecordInputSchema.parse(input);
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.rpc("upsert_customer_record", {
        p_customer_id: id,
        p_company_name: parsed.company.companyName,
        p_customer_type: parsed.company.type,
        p_email_domain_suffix: parsed.company.emailDomainSuffix,
        p_employees: parsed.employees,
        p_user_id: userId,
      });
      assertNoError({ error }, "upsertCustomer");
      return mapCustomer(data, (data as { employees?: unknown } | null)?.employees);
    },

    async listSuppliers() {
      const { data, error } = await supabase
        .from("suppliers")
        .select(
          "id, company_name, email_domain_suffix, product_types, created_at, updated_at, supplier_employees(id, user_name, email_prefix, title, tel, sort_index)",
        )
        .order("updated_at", { ascending: false });
      assertNoError({ error }, "listSuppliers");
      return toUnknownArray(data).map((row) => {
        const record = row as { supplier_employees?: unknown };
        return mapSupplier(record, record.supplier_employees);
      });
    },

    async upsertSupplier(id, input) {
      const parsed = supplierRecordInputSchema.parse(input);
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.rpc("upsert_supplier_record", {
        p_company_name: parsed.company.companyName,
        p_email_domain_suffix: parsed.company.emailDomainSuffix,
        p_employees: parsed.employees,
        p_product_types: parsed.company.productTypes,
        p_supplier_id: id,
        p_user_id: userId,
      });
      assertNoError({ error }, "upsertSupplier");
      return mapSupplier(data, (data as { employees?: unknown } | null)?.employees);
    },

    async listProducts() {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, subject, detail, material, color_notes, image_name, image_url, image_storage_path, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });
      assertNoError({ error }, "listProducts");
      return toUnknownArray(data).map(mapProduct);
    },

    async upsertProduct(id, input) {
      const parsed = productRecordInputSchema.parse(input);
      const userId = await getCurrentUserId();
      const row = {
        user_id: userId,
        subject: parsed.subject,
        detail: parsed.detail,
        material: parsed.material,
        color_notes: parsed.colorNotes,
        image_name: parsed.image?.name ?? null,
        image_url: parsed.image?.url ?? null,
        image_storage_path: parsed.image?.storagePath ?? null,
        updated_at: new Date().toISOString(),
      };
      const selection =
        "id, subject, detail, material, color_notes, image_name, image_url, image_storage_path, created_at, updated_at";
      const { data, error } = id
        ? await supabase.from("products").update(row).eq("id", id).select(selection).single()
        : await supabase.from("products").insert(row).select(selection).single();
      assertNoError({ error }, "upsertProduct");
      return mapProduct(data);
    },
  };
}
