import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { localRecoveryArchiveSchema } from "@/lib/local-recovery";
import { parseCanvasContent } from "@/lib/nodes/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeProductRecord,
  normalizeSupplierProductTypes,
  type ProductRecord,
} from "@/lib/workspace-records";

const timestampSchema = z.string().datetime();
const idSchema = z.string().min(1);

const employeeSchema = z.object({
  id: idSchema,
  userName: z.string().default(""),
  emailPrefix: z.string().default(""),
  title: z.string().default(""),
  tel: z.string().default(""),
});

const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const canvasSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  content: z.unknown(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const imageSchema = z.object({
  id: idSchema,
  canvasId: idSchema.nullable(),
  source: z.enum(["upload", "generated"]),
  url: z.string().min(1),
  storagePath: z.string().nullable(),
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: timestampSchema,
});

const customerSchema = z.object({
  id: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  company: z.object({
    companyName: z.string().min(1),
    emailDomainSuffix: z.string(),
    type: z.string().default("customer"),
  }),
  employees: z.array(employeeSchema).default([]),
});

const supplierSchema = z.object({
  id: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  company: z.object({
    companyName: z.string().min(1),
    emailDomainSuffix: z.string(),
    productTypes: z.array(z.string()).default(["woven-label"]),
  }),
  employees: z.array(employeeSchema).default([]),
});

function databaseId(value: string): string {
  if (z.string().uuid().safeParse(value).success) return value;
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function failure(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeArchiveProducts(records: unknown[]): ProductRecord[] {
  return records.map((record) => normalizeProductRecord(record));
}

export async function POST(request: Request) {
  const archiveResult = localRecoveryArchiveSchema.safeParse(await request.json());
  if (!archiveResult.success) return failure("Invalid recovery archive.");

  const projectsResult = z.array(projectSchema).safeParse(archiveResult.data.projects);
  const canvasesResult = z.array(canvasSchema).safeParse(archiveResult.data.canvases);
  const imagesResult = z.array(imageSchema).safeParse(archiveResult.data.images);
  const customersResult = z.array(customerSchema).safeParse(archiveResult.data.customers);
  const suppliersResult = z.array(supplierSchema).safeParse(archiveResult.data.suppliers);
  const productsResult = z.array(z.unknown()).safeParse(archiveResult.data.products);

  if (
    !projectsResult.success ||
    !canvasesResult.success ||
    !imagesResult.success ||
    !customersResult.success ||
    !suppliersResult.success ||
    !productsResult.success
  ) {
    return failure("Archive records do not match the database schema.");
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return failure("Sign in before importing local records.", 401);
  const userId = auth.user.id;

  const projects = projectsResult.data.map((record) => ({
    id: databaseId(record.id),
    user_id: userId,
    name: record.name,
    description: record.description,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }));
  if (projects.length) {
    const { error } = await supabase.from("projects").upsert(projects, { onConflict: "id" });
    if (error) return failure(`Projects: ${error.message}`, 409);
  }

  const canvases = canvasesResult.data.map((record) => ({
    id: databaseId(record.id),
    project_id: databaseId(record.projectId),
    user_id: userId,
    name: record.name,
    content: parseCanvasContent(record.content),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }));
  if (canvases.length) {
    const { error } = await supabase.from("canvases").upsert(canvases, { onConflict: "id" });
    if (error) return failure(`Canvases: ${error.message}`, 409);

    for (const canvas of canvases) {
      const { error: graphError } = await supabase.rpc("replace_canvas_graph", {
        p_canvas_id: canvas.id,
        p_content: canvas.content,
        p_edges: canvas.content.edges,
        p_nodes: canvas.content.nodes,
      });
      if (graphError) return failure(`Canvas ${canvas.name}: ${graphError.message}`, 409);
    }
  }

  const images = imagesResult.data.map((record) => ({
    id: databaseId(record.id),
    user_id: userId,
    canvas_id: record.canvasId ? databaseId(record.canvasId) : null,
    source: record.source,
    url: record.url,
    storage_path: record.storagePath,
    prompt: record.prompt,
    model: record.model,
    created_at: record.createdAt,
  }));
  if (images.length) {
    const { error } = await supabase.from("images").upsert(images, { onConflict: "id" });
    if (error) return failure(`Images: ${error.message}`, 409);
  }

  for (const customer of customersResult.data) {
    const { error } = await supabase.from("customers").upsert(
      {
        id: databaseId(customer.id),
        user_id: userId,
        company_name: customer.company.companyName,
        email_domain_suffix: customer.company.emailDomainSuffix,
        customer_type: customer.company.type,
        created_at: customer.createdAt,
        updated_at: customer.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) return failure(`Customer: ${error.message}`, 409);

    const employees = customer.employees.map((employee, sortIndex) => ({
      id: employee.id,
      customer_id: databaseId(customer.id),
      user_id: userId,
      user_name: employee.userName,
      email_prefix: employee.emailPrefix,
      title: employee.title,
      tel: employee.tel,
      sort_index: sortIndex,
    }));
    if (employees.length) {
      const { error: employeeError } = await supabase
        .from("customer_employees")
        .upsert(employees, { onConflict: "customer_id,id" });
      if (employeeError) return failure(`Customer employees: ${employeeError.message}`, 409);
    }
  }

  for (const supplier of suppliersResult.data) {
    const { error } = await supabase.from("suppliers").upsert(
      {
        id: databaseId(supplier.id),
        user_id: userId,
        company_name: supplier.company.companyName,
        email_domain_suffix: supplier.company.emailDomainSuffix,
        product_types: normalizeSupplierProductTypes(supplier.company.productTypes),
        created_at: supplier.createdAt,
        updated_at: supplier.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) return failure(`Supplier: ${error.message}`, 409);

    const employees = supplier.employees.map((employee, sortIndex) => ({
      id: employee.id,
      supplier_id: databaseId(supplier.id),
      user_id: userId,
      user_name: employee.userName,
      email_prefix: employee.emailPrefix,
      title: employee.title,
      tel: employee.tel,
      sort_index: sortIndex,
    }));
    if (employees.length) {
      const { error: employeeError } = await supabase
        .from("supplier_employees")
        .upsert(employees, { onConflict: "supplier_id,id" });
      if (employeeError) return failure(`Supplier employees: ${employeeError.message}`, 409);
    }
  }

  const normalizedProducts = normalizeArchiveProducts(productsResult.data).map((record) => ({
    ...record,
    supplierId: record.supplierId ? databaseId(record.supplierId) : null,
  }));

  for (const product of normalizedProducts) {
    const { error } = await supabase.rpc("upsert_product_with_variants", {
      p_product_id: databaseId(product.id),
      p_user_id: userId,
      p_supplier_id: product.supplierId,
      p_product_type: product.productType,
      p_subject: product.subject,
      p_detail: product.detail,
      p_variants: product.variants.map((variant) => ({
        id: variant.id,
        sortIndex: variant.sortIndex,
        material: variant.material,
        colorNotes: variant.colorNotes,
        parameters: variant.parameters,
        unitPrice: variant.unitPrice,
        priceUnit: variant.priceUnit,
        image: variant.image,
      })),
    });
    if (error) return failure(`Products: ${error.message}`, 409);
  }

  return NextResponse.json({
    imported: {
      projects: projects.length,
      canvases: canvases.length,
      nodes: canvases.reduce((sum, canvas) => sum + canvas.content.nodes.length, 0),
      customers: customersResult.data.length,
      suppliers: suppliersResult.data.length,
      products: normalizedProducts.length,
      images: images.length,
    },
  });
}
