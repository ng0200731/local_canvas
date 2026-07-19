import { describe, expect, it } from "vitest";

import { payloadSummary, sampleUpdatePayloadSchema } from "@/lib/sample-orders";

describe("sampleUpdatePayloadSchema", () => {
  it("validates AWB-based shipment updates", () => {
    const parsed = sampleUpdatePayloadSchema.parse({
      stage: "shipment",
      carrier: "DHL",
      awb: "AWB-1",
      shipDate: "2026-07-14",
      eta: "2026-07-18",
      documentUrl: "",
    });
    if (parsed.stage !== "shipment") throw new Error("Expected shipment payload");
    expect(parsed.awb).toBe("AWB-1");
    expect(payloadSummary(parsed)).toBe("DHL · AWB AWB-1");
  });

  it("rejects fields belonging to another stage", () => {
    expect(
      sampleUpdatePayloadSchema.safeParse({
        stage: "pmc",
        carrier: "DHL",
      }).success,
    ).toBe(false);
  });

  it("rejects defective percentages outside zero to one hundred", () => {
    expect(
      sampleUpdatePayloadSchema.safeParse({
        stage: "quality_control",
        qcStartDate: "2026-07-14",
        defectivePercent: 130,
        inspectedQuantity: 10,
        evidenceUrl: "",
      }).success,
    ).toBe(false);
  });
});
