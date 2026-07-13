import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { renderCanvasReportPdf } from "@/lib/email/pdf-report";
import type { CanvasReportPayload } from "@/lib/email/schemas";

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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
          image: {
            url: tinyPng,
            alt: "Customer shirt sample",
          },
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
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
  });

  it("converts WebP report images before embedding them in the PDF", async () => {
    const webp = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: "#ff0000",
      },
    })
      .webp()
      .toBuffer();
    const webpReport: CanvasReportPayload = {
      ...report,
      sections: report.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => ({
          ...block,
          image: {
            url: `data:image/webp;base64,${webp.toString("base64")}`,
            alt: "WebP render",
          },
        })),
      })),
    };

    const pdf = await renderCanvasReportPdf({
      title: webpReport.title,
      customerName: webpReport.project.customerName,
      text: "Fallback text",
      report: webpReport,
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
  });

  it("does not create excessive blank pages for tall supplier detail blocks", async () => {
    const tallReport: CanvasReportPayload = {
      ...report,
      sections: [
        {
          id: "supplier-details",
          title: "Supplier details",
          blocks: Array.from({ length: 4 }, (_, index) => ({
            id: `supplier-${index + 1}`,
            title: `Supplier ${index + 1}`,
            subtitle: `@supplier${index + 1}`,
            details: Array.from({ length: 22 }, (_item, detailIndex) => ({
              label: `Detail ${detailIndex + 1}`,
              value: "Long supplier detail value for layout testing.",
            })),
            image: {
              url: tinyPng,
              alt: `Supplier ${index + 1}`,
            },
          })),
        },
      ],
      steps: [],
    };

    const pdf = await renderCanvasReportPdf({
      title: tallReport.title,
      customerName: tallReport.project.customerName,
      text: "Fallback text",
      report: tallReport,
    });
    const pageCounts = Array.from(pdf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)).map(
      (match) => Number(match[1]),
    );
    const pageCount = pageCounts.length ? Math.max(...pageCounts) : 0;

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount).toBeGreaterThan(0);
    expect(pageCount).toBeLessThanOrEqual(6);
  });
});
