import { describe, expect, it } from "vitest";

import {
  customerCompanySchema,
  customerProductTypes,
  hadAtSymbol,
  normalizeProductRecord,
  normalizeEmailDomainSuffix,
  normalizeSupplierProductTypes,
  productSchema,
  supplierCompanySchema,
} from "@/lib/workspace-records";

describe("workspace record validation", () => {
  it("normalizes email domain suffix input without an at sign", () => {
    expect(normalizeEmailDomainSuffix("  @Example.COM ")).toBe("example.com");
    expect(hadAtSymbol("@example.com")).toBe(true);
    expect(hadAtSymbol("example.com")).toBe(false);
  });

  it("validates customer company fields", () => {
    expect(
      customerCompanySchema.safeParse({
        companyName: "Northstar",
        emailDomainSuffix: "northstar.com",
        type: "Brand owner",
      }).success,
    ).toBe(true);

    expect(
      customerCompanySchema.safeParse({
        companyName: "",
        emailDomainSuffix: "northstar",
        type: "",
      }).success,
    ).toBe(false);
  });

  it("requires supplier product types", () => {
    expect(
      supplierCompanySchema.safeParse({
        companyName: "Bright Trim",
        emailDomainSuffix: "brighttrim.com",
        productTypes: ["woven-label", "hang-tag"],
      }).success,
    ).toBe(true);

    expect(
      supplierCompanySchema.safeParse({
        companyName: "Bright Trim",
        emailDomainSuffix: "brighttrim.com",
        productTypes: [],
      }).success,
    ).toBe(false);
  });

  it("normalizes legacy supplier product types", () => {
    expect(normalizeSupplierProductTypes(["label", "tag", "zipper", "snap"])).toEqual([
      "woven-label",
      "hang-tag",
      "metal",
      "button",
    ]);
  });

  it("validates product records", () => {
    expect(
      productSchema.safeParse({
        supplierId: "supplier-1",
        productType: "woven-label",
        subject: "Woven label",
        detail: "Main neck label and care label",
        variants: [
          {
            id: "variant-1",
            sortIndex: 0,
            material: "Polyester",
            colorNotes: "Black and white",
            parameters: {
              size: "45 x 20 mm",
              fold: "Center fold",
            },
            unitPrice: "0.032",
            priceUnit: "per pc",
            image: {
              name: "label.webp",
              url: "https://example.com/label.webp",
              storagePath: null,
            },
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      productSchema.safeParse({
        supplierId: "",
        productType: "woven-label",
        subject: "",
        detail: "",
        variants: [],
      }).success,
    ).toBe(false);
  });

  it("validates customer garment products and requires a customer project", () => {
    const variant = {
      id: "variant-1",
      sortIndex: 0,
      material: "Cotton jersey",
      colorNotes: "Pantone Black C",
      parameters: { sizeRange: "XS-XL" },
      unitPrice: "9.5",
      priceUnit: "per pc",
      image: {
        name: "shirt.webp",
        url: "https://example.com/shirt.webp",
        storagePath: null,
      },
    };

    expect(customerProductTypes).toHaveLength(33);
    expect(
      productSchema.safeParse({
        ownerKind: "customer",
        customerId: "customer-1",
        projectId: "project-1",
        productType: "shirt",
        subject: "SH-001",
        detail: "Customer shirt sample",
        variants: [variant],
      }).success,
    ).toBe(true);
    expect(
      productSchema.safeParse({
        ownerKind: "customer",
        customerId: "customer-1",
        productType: "woven-label",
        subject: "SH-001",
        detail: "Missing project",
        variants: [variant],
      }).success,
    ).toBe(false);
  });

  it("normalizes legacy flat product records into one variant", () => {
    const product = normalizeProductRecord({
      id: "product-1",
      supplierId: "supplier-1",
      productType: "hang-tag",
      subject: "Legacy trim",
      detail: "Legacy description",
      material: "Paper",
      colorNotes: "Black",
      parameters: {
        size: "45 x 90 mm",
        ignored: 123,
      },
      unitPrice: "0.05",
      priceUnit: "per pc",
      image: {
        name: "legacy.webp",
        url: "https://example.com/legacy.webp",
        storagePath: null,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(product.variants).toHaveLength(1);
    expect(product.ownerKind).toBe("supplier");
    expect(product.variants[0]).toMatchObject({
      id: "variant-1",
      sortIndex: 0,
      material: "Paper",
      colorNotes: "Black",
      parameters: {
        size: "45 x 90 mm",
      },
      unitPrice: "0.05",
      priceUnit: "per pc",
    });
  });
});
