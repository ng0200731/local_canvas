import { describe, expect, it } from "vitest";

import { payloadSummary, sampleUpdatePayloadSchema } from "@/lib/sample-orders";

describe("sampleUpdatePayloadSchema", () => {
  it("coerces and validates stage-specific numeric fields", () => {
    const parsed = sampleUpdatePayloadSchema.parse({
      stage: "shipment",
      carrier: "DHL",
      shippingMethod: "Express",
      trackingNumber: "TRACK-1",
      shippedQuantity: "500",
      shipDate: "2026-07-14",
      eta: "2026-07-18",
      documentUrl: "",
    });
    expect(parsed.shippedQuantity).toBe(500);
    expect(payloadSummary(parsed)).toBe("DHL · TRACK-1");
  });

  it("rejects fields belonging to another stage", () => {
    expect(
      sampleUpdatePayloadSchema.safeParse({
        stage: "pmc",
        carrier: "DHL",
      }).success,
    ).toBe(false);
  });

  it("rejects percentages outside zero to one hundred", () => {
    expect(
      sampleUpdatePayloadSchema.safeParse({
        stage: "production",
        startDate: "2026-07-14",
        plannedQuantity: 10,
        completedQuantity: 2,
        progressPercent: 130,
        expectedFinishDate: "2026-07-20",
        notes: "",
      }).success,
    ).toBe(false);
  });
});
