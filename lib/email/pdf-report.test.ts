import { describe, expect, it } from "vitest";

import { renderCanvasReportPdf } from "@/lib/email/pdf-report";
import type { CanvasReportPayload } from "@/lib/email/schemas";

const report: CanvasReportPayload = {
  title: "Sample canvas report",
  generatedAt: "2026-07-13T00:00:00.000Z",
  project: {
    name: "Launch board",
    customerName: "Harborline Retail Ltd.",
    employeeName: "Amy Wong",
    employeeTitle: "Buyer",
    employeeEmail: "amy@example.com",
    employeeTel: "+852 1234 5678",
    currency: "USD $",
    destination: "United States",
  },
  sections: [
    {
      id: "customer-products",
      title: "Product list",
      blocks: [
        {
          id: "product-1",
          title: "SH-001",
          subtitle: "Shirt",
          details: [
            { label: "Owner", value: "Harborline Retail Ltd." },
            { label: "Product details", value: "Customer shirt sample" },
          ],
          image: null,
        },
      ],
    },
  ],
  steps: [
    {
      id: "step-1",
      title: "1. generate node",
      detail: "Created Generate node with prompt: Generate label mockup.",
    },
  ],
};

describe("renderCanvasReportPdf", () => {
  it("renders a structured report PDF attachment", async () => {
    const pdf = await renderCanvasReportPdf({
      title: report.title,
      customerName: report.project.customerName,
      text: "Fallback text",
      report,
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
