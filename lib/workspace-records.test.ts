import { describe, expect, it } from "vitest";

import {
  customerCompanySchema,
  hadAtSymbol,
  normalizeEmailDomainSuffix,
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
        productTypes: ["label", "zipper"],
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

  it("validates product records", () => {
    expect(
      productSchema.safeParse({
        subject: "Woven label",
        detail: "Main neck label and care label",
        material: "Polyester",
        colorNotes: "Black and white",
        image: {
          name: "label.webp",
          url: "https://example.com/label.webp",
          storagePath: null,
        },
      }).success,
    ).toBe(true);

    expect(
      productSchema.safeParse({
        subject: "",
        detail: "",
        material: "",
        colorNotes: "",
        image: null,
      }).success,
    ).toBe(false);
  });
});
