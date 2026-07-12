import { z } from "zod";

export const supplierProductTypes = [
  "woven-label",
  "wash-care-label",
  "hang-tag",
  "heat-transfer",
  "elastic",
  "drawcord",
  "metal",
  "button",
  "pu-patch",
  "embroidery-patch",
  "silicon-patch",
  "thread",
  "polybag",
] as const;

export type SupplierProductType = (typeof supplierProductTypes)[number];

export const defaultSupplierProductType = "woven-label" satisfies SupplierProductType;

export const supplierProductTypeLabels: Record<SupplierProductType, string> = {
  "woven-label": "Woven label",
  "wash-care-label": "Wash care label",
  "hang-tag": "Hang tag",
  "heat-transfer": "Heat transfer",
  elastic: "Elastic",
  drawcord: "Drawcord",
  metal: "Metal",
  button: "Button",
  "pu-patch": "PU patch",
  "embroidery-patch": "Embroidery patch",
  "silicon-patch": "Silicon patch",
  thread: "Thread",
  polybag: "Polybag",
};

const legacySupplierProductTypeMap: Record<string, SupplierProductType> = {
  label: "woven-label",
  tag: "hang-tag",
  zipper: "metal",
  snap: "button",
};

export function normalizeSupplierProductTypes(values: readonly string[]): SupplierProductType[] {
  const normalized = values
    .map((value) =>
      supplierProductTypes.includes(value as SupplierProductType)
        ? (value as SupplierProductType)
        : legacySupplierProductTypeMap[value],
    )
    .filter((value): value is SupplierProductType => Boolean(value));

  return Array.from(new Set(normalized));
}

export function normalizeSupplierProductType(value: string | null | undefined): SupplierProductType {
  return normalizeSupplierProductTypes(value ? [value] : [])[0] ?? defaultSupplierProductType;
}

export function getProductPriceUnit(productType: SupplierProductType): string {
  if (productType === "elastic" || productType === "drawcord") return "per meter";
  if (productType === "thread") return "per cone";
  if (productType === "polybag") return "per bag";
  return "per pc";
}

export function normalizeProductParameters(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, parameterValue]) => [key, parameterValue]),
  );
}

const domainSuffixSchema = z
  .string()
  .trim()
  .min(1, "Email domain suffix is required.")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i, {
    message: "Use a domain like example.com.",
  });

export const customerCompanySchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required."),
  emailDomainSuffix: domainSuffixSchema,
  type: z.string().trim().min(1, "Customer type is required."),
});

export const supplierCompanySchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required."),
  emailDomainSuffix: domainSuffixSchema,
  productTypes: z.array(z.enum(supplierProductTypes)).min(1, "Choose at least one product type."),
});

export const employeeSchema = z.object({
  userName: z.string().trim().min(1, "User name is required."),
  emailPrefix: z.string().trim().min(1, "Email prefix is required."),
  title: z.string().trim().min(1, "Title is required."),
  tel: z.string().trim().min(1, "Telephone is required."),
});

export const productImageSchema = z.object({
  name: z.string().trim().min(1, "Image name is required."),
  url: z.string().trim().min(1, "Image URL is required."),
  storagePath: z.string().nullable(),
});

export const productVariantInputSchema = z.object({
  id: z.string().trim().min(1, "Variant id is required."),
  sortIndex: z.number().int().min(0),
  material: z.string().trim().min(1, "Material is required."),
  colorNotes: z.string().trim().min(1, "Color notes are required."),
  parameters: z.record(z.string(), z.string()),
  unitPrice: z.string().trim().min(1, "Unit price is required."),
  priceUnit: z.string().trim().min(1, "Price unit is required."),
  image: productImageSchema,
});

export const productVariantRecordSchema = productVariantInputSchema.extend({
  image: productImageSchema.nullable(),
});

export const productRecordInputSchema = z.object({
  supplierId: z.string().trim().min(1, "Supplier is required."),
  productType: z.enum(supplierProductTypes),
  subject: z.string().trim().min(1, "Subject is required."),
  detail: z.string().trim().min(1, "Product detail is required."),
  variants: z.array(productVariantInputSchema).min(1, "Add at least one product image."),
});

export const productSchema = productRecordInputSchema;

export type CustomerCompanyInput = z.infer<typeof customerCompanySchema>;
export type SupplierCompanyInput = z.infer<typeof supplierCompanySchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type ProductImageInput = z.infer<typeof productImageSchema>;
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;
export type ProductInput = z.infer<typeof productSchema>;

export interface EmployeeRecord extends EmployeeInput {
  id: string;
}

export interface CustomerRecord {
  id: string;
  company: CustomerCompanyInput;
  employees: EmployeeRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierRecord {
  id: string;
  company: SupplierCompanyInput;
  employees: EmployeeRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantRecord extends Omit<ProductVariantInput, "image"> {
  image: ProductImageInput | null;
}

export interface ProductRecord {
  id: string;
  supplierId: string | null;
  productType: SupplierProductType;
  subject: string;
  detail: string;
  variants: ProductVariantRecord[];
  createdAt: string;
  updatedAt: string;
}

export const customerRecordInputSchema = z.object({
  company: customerCompanySchema,
  employees: z.array(employeeSchema.extend({ id: z.string().min(1) })).min(1),
});

export const supplierRecordInputSchema = z.object({
  company: supplierCompanySchema,
  employees: z.array(employeeSchema.extend({ id: z.string().min(1) })).min(1),
});

export type CustomerRecordInput = z.infer<typeof customerRecordInputSchema>;
export type SupplierRecordInput = z.infer<typeof supplierRecordInputSchema>;
export type ProductRecordInput = z.infer<typeof productRecordInputSchema>;
export type ProductVariantRecordInput = z.infer<typeof productVariantRecordSchema>;

function normalizeProductUnitPrice(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "0";
}

function normalizeProductPriceUnit(
  value: unknown,
  productType: SupplierProductType,
): string {
  return typeof value === "string" && value.trim() ? value : getProductPriceUnit(productType);
}

export function normalizeProductVariant(
  value: unknown,
  fallbackProductType: SupplierProductType,
  fallbackSortIndex = 0,
): ProductVariantRecord {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const parsed = productVariantRecordSchema.safeParse({
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : `variant-${fallbackSortIndex + 1}`,
    sortIndex: typeof candidate.sortIndex === "number" ? candidate.sortIndex : fallbackSortIndex,
    material: typeof candidate.material === "string" ? candidate.material : "",
    colorNotes: typeof candidate.colorNotes === "string" ? candidate.colorNotes : "",
    parameters: normalizeProductParameters(candidate.parameters),
    unitPrice: normalizeProductUnitPrice(candidate.unitPrice),
    priceUnit: normalizeProductPriceUnit(candidate.priceUnit, fallbackProductType),
    image: productImageSchema.nullable().catch(null).parse(candidate.image ?? null),
  });

  return parsed.success
    ? parsed.data
    : {
        id: `variant-${fallbackSortIndex + 1}`,
        sortIndex: fallbackSortIndex,
        material: "",
        colorNotes: "",
        parameters: {},
        unitPrice: "0",
        priceUnit: getProductPriceUnit(fallbackProductType),
        image: null,
      };
}

export function normalizeProductRecord(value: unknown): ProductRecord {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const productType = normalizeSupplierProductType(
    typeof candidate.productType === "string" ? candidate.productType : null,
  );
  const variantsValue = Array.isArray(candidate.variants) ? candidate.variants : [];
  const variants =
    variantsValue.length > 0
      ? variantsValue.map((variant, index) => normalizeProductVariant(variant, productType, index))
      : [
          normalizeProductVariant(
            {
              id: "variant-1",
              sortIndex: 0,
              material: typeof candidate.material === "string" ? candidate.material : "",
              colorNotes: typeof candidate.colorNotes === "string" ? candidate.colorNotes : "",
              parameters: candidate.parameters,
              unitPrice: candidate.unitPrice,
              priceUnit: candidate.priceUnit,
              image: candidate.image ?? null,
            },
            productType,
            0,
          ),
        ];

  return {
    id: typeof candidate.id === "string" ? candidate.id : "",
    supplierId:
      typeof candidate.supplierId === "string" && candidate.supplierId.trim()
        ? candidate.supplierId
        : null,
    productType,
    subject: typeof candidate.subject === "string" ? candidate.subject : "",
    detail: typeof candidate.detail === "string" ? candidate.detail : "",
    variants: variants
      .sort((left, right) => left.sortIndex - right.sortIndex)
      .map((variant, index) => ({ ...variant, sortIndex: index })),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

export function normalizeEmailDomainSuffix(value: string) {
  return value.trim().replaceAll("@", "").replace(/\s+/g, "").toLowerCase();
}

export function hadAtSymbol(value: string) {
  return value.includes("@");
}
