import { z } from "zod";

export const supplierProductTypes = ["label", "tag", "zipper", "embroidery-patch", "snap"] as const;

export type SupplierProductType = (typeof supplierProductTypes)[number];

export const supplierProductTypeLabels: Record<SupplierProductType, string> = {
  label: "Label",
  tag: "Tag",
  zipper: "Zipper",
  "embroidery-patch": "Embroidery patch",
  snap: "Snap",
};

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

export type CustomerCompanyInput = z.infer<typeof customerCompanySchema>;
export type SupplierCompanyInput = z.infer<typeof supplierCompanySchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;

export function normalizeEmailDomainSuffix(value: string) {
  return value.trim().replaceAll("@", "").replace(/\s+/g, "").toLowerCase();
}

export function hadAtSymbol(value: string) {
  return value.includes("@");
}
