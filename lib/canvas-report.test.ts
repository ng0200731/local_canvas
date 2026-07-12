import { describe, expect, it } from "vitest";

import { buildCanvasReport } from "@/lib/canvas-report";
import type { Canvas, ImageRecord, Project } from "@/lib/store";
import type { ProductRecord, SupplierRecord } from "@/lib/workspace-records";

const now = "2026-07-13T00:00:00.000Z";
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const project: Project = {
  id: "project-1",
  name: "Launch board",
  description: null,
  customerId: "customer-1",
  customerName: "Harborline Retail Ltd.",
  employeeId: "employee-1",
  employeeName: "Amy Wong",
  employeeTitle: "Buyer",
  employeeEmail: "amy@example.com",
  employeeTel: "+852 1234 5678",
  currencyCode: "USD",
  currencyName: "US Dollar",
  currencySymbol: "$",
  destinationCountryCode: "US",
  destinationCountryName: "United States",
  createdAt: now,
  updatedAt: now,
};

const suppliers: SupplierRecord[] = [
  {
    id: "supplier-1",
    company: {
      companyName: "Bright Sample Factory",
      emailDomainSuffix: "factory.example",
      productTypes: ["woven-label"],
    },
    employees: [
      {
        id: "supplier-employee-1",
        userName: "Sam",
        emailPrefix: "sam",
        title: "Sales",
        tel: "+86 755 0000",
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "supplier-2",
    company: {
      companyName: "Elastic Works",
      emailDomainSuffix: "elastic.example",
      productTypes: ["elastic"],
    },
    employees: [
      {
        id: "supplier-employee-2",
        userName: "Eve",
        emailPrefix: "eve",
        title: "Sales",
        tel: "+86 755 1111",
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
];

const products: ProductRecord[] = [
  {
    id: "customer-product-1",
    ownerKind: "customer",
    supplierId: null,
    customerId: "customer-1",
    projectId: null,
    productType: "shirt",
    subject: "SH-001",
    detail: "Customer shirt sample",
    variants: [
      {
        id: "customer-variant-1",
        sortIndex: 0,
        material: "Cotton jersey",
        colorNotes: "Pantone Black C",
        parameters: { sizeRange: "XS-XL" },
        unitPrice: "9.50",
        priceUnit: "per pc",
        image: {
          name: "shirt.png",
          url: tinyPng,
          storagePath: null,
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "supplier-product-1",
    ownerKind: "supplier",
    supplierId: "supplier-1",
    customerId: null,
    projectId: null,
    productType: "woven-label",
    subject: "WL-101",
    detail: "Woven neck label",
    variants: [
      {
        id: "supplier-variant-1",
        sortIndex: 0,
        material: "Polyester",
        colorNotes: "Black ground, white logo",
        parameters: {
          sampleLeadTime: "7 days",
          sampleCharge: "USD 45",
          bulkLeadTime: "18 days",
          productionLeadTime: "18 days",
        },
        unitPrice: "0.18",
        priceUnit: "per pc",
        image: {
          name: "label.png",
          url: tinyPng,
          storagePath: null,
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "supplier-product-2",
    ownerKind: "supplier",
    supplierId: "supplier-2",
    customerId: null,
    projectId: null,
    productType: "elastic",
    subject: "EL-202",
    detail: "Elastic tape",
    variants: [
      {
        id: "supplier-variant-2",
        sortIndex: 0,
        material: "Nylon",
        colorNotes: "Black",
        parameters: {
          sampleLeadTime: "5 days",
          sampleCharge: "USD 25",
          bulkLeadTime: "20 days",
        },
        unitPrice: "0.42",
        priceUnit: "per meter",
        image: {
          name: "elastic.png",
          url: tinyPng,
          storagePath: null,
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
];

const canvas: Canvas = {
  id: "canvas-1",
  projectId: "project-1",
  name: "Sample canvas",
  createdAt: now,
  updatedAt: now,
  content: {
    nodes: [
      {
        id: "product-node",
        type: "product",
        position: { x: 0, y: 0 },
        data: {
          alias: "product",
          customerId: "customer-1",
          customerName: "Harborline Retail Ltd.",
          productId: "customer-product-1",
          productSubject: "SH-001",
          variantId: "customer-variant-1",
          variantImageUrl: tinyPng,
          variantImageName: "shirt.png",
        },
      },
      {
        id: "supplier-node",
        type: "suppler",
        position: { x: 300, y: 0 },
        data: {
          alias: "supplier",
          supplierId: "supplier-1",
          supplierName: "Bright Sample Factory",
          productId: "supplier-product-1",
          productSubject: "WL-101",
          variantId: "supplier-variant-1",
          variantImageUrl: tinyPng,
          variantImageName: "label.png",
        },
      },
      {
        id: "supplier-node-2",
        type: "suppler",
        position: { x: 300, y: 200 },
        data: {
          alias: "elastic",
          supplierId: "supplier-2",
          supplierName: "Elastic Works",
          productId: "supplier-product-2",
          productSubject: "EL-202",
          variantId: "supplier-variant-2",
          variantImageUrl: tinyPng,
          variantImageName: "elastic.png",
        },
      },
      {
        id: "generate-node",
        type: "generate",
        position: { x: 600, y: 0 },
        data: {
          prompt: "Generate label mockup from @supplier",
          model: "gpt-image-2",
          status: "done",
          resultUrl: tinyPng,
        },
      },
      {
        id: "output-node",
        type: "imageOutput",
        position: { x: 900, y: 0 },
        data: {
          prompt: "Generate label mockup from @supplier",
          model: "gpt-image-2",
          status: "done",
          resultUrl: tinyPng,
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "supplier-node", target: "generate-node" },
      { id: "edge-1b", source: "supplier-node-2", target: "generate-node" },
      { id: "edge-2", source: "generate-node", target: "output-node" },
    ],
  },
};

const images: ImageRecord[] = [];

describe("buildCanvasReport", () => {
  it("builds the send/report sequence without repeating supplier details in breakdowns", () => {
    const report = buildCanvasReport({
      canvas,
      project,
      customers: [],
      suppliers,
      products,
      images,
    });

    expect(report.sections.map((section) => section.title)).toEqual([
      "Supplier breakdown",
      "Supplier details",
      "Output and input prompt",
      "Product list",
      "Pantone",
      "Generic node",
    ]);
    expect(report.project.customerName).toBe("Harborline Retail Ltd.");
    expect(report.outputBlocks).toHaveLength(1);
    expect(report.outputBlocks[0]?.details).toContainEqual({
      label: "Input prompt",
      value: "Generate label mockup from @supplier",
    });
    expect(report.supplierBreakdowns).toHaveLength(1);
    expect(report.supplierBreakdowns[0]?.details).toContainEqual({
      label: "Total sample charge",
      value: "Bright Sample Factory: USD 45 + Elastic Works: USD 25 = USD 70",
    });
    expect(report.supplierBreakdowns[0]?.details).toContainEqual({
      label: "Total sample lead time",
      value: "Bright Sample Factory: 7 days + Elastic Works: 5 days = 7 days",
    });
    expect(report.supplierBreakdowns[0]?.details).toContainEqual({
      label: "Total bulk lead time",
      value: "Bright Sample Factory: 18 days + Elastic Works: 20 days = 20 days",
    });
    expect(report.supplierBreakdowns[0]?.table).toEqual({
      columns: ["Sample cost", "Sample lead time", "Bulk cost", "Bulk lead time"],
      rows: [
        {
          label: "Bright Sample Factory",
          values: ["USD 45", "7 days", "0.18 per pc", "18 days"],
        },
        {
          label: "Elastic Works",
          values: ["USD 25", "5 days", "0.42 per meter", "20 days"],
        },
        {
          label: "Total",
          values: ["USD 70", "7 days", "0.60 mixed units", "20 days"],
        },
      ],
    });
    expect(report.supplierBreakdowns[0]?.details).toContainEqual({
      label: "Bright Sample Factory - Production cost",
      value: "0.18 per pc",
    });
    expect(report.supplierBreakdowns[0]?.details).toContainEqual({
      label: "Elastic Works - Bulk Lead Time",
      value: "20 days",
    });
    expect(report.supplierBreakdowns[0]?.image?.url).toBe(tinyPng);
    expect(report.html.match(/Supplier details/g)).toHaveLength(1);
    expect(report.html.indexOf("Supplier breakdown")).toBeLessThan(
      report.html.indexOf("Supplier details"),
    );
    expect(report.html.indexOf("Supplier details")).toBeLessThan(
      report.html.indexOf("Output and input prompt"),
    );
    expect(report.html).toContain('class="breakdown-table"');
    expect(report.html).toContain('class="supplier-matrix"');
    expect(report.html).toContain('class="total-row"');
    expect(report.html).toContain("Output and input prompt");
  });

  it("uses the selected render image as the report image when the canvas output has no image", () => {
    const canvasWithoutOutputImage: Canvas = {
      ...canvas,
      content: {
        ...canvas.content,
        nodes: canvas.content.nodes.map((node) =>
          node.id === "output-node" || node.id === "generate-node"
            ? {
                ...node,
                data: {
                  ...node.data,
                  resultUrl: null,
                },
              }
            : node,
        ),
      },
    };
    const report = buildCanvasReport({
      canvas: canvasWithoutOutputImage,
      project,
      customers: [],
      suppliers,
      products,
      images: [
        {
          id: "selected-render",
          canvasId: "canvas-1",
          source: "generated",
          url: tinyPng,
          storagePath: null,
          prompt: "Selected final render",
          model: "gpt-image-2",
          modelDetails: {
            model: "gpt-image-2",
            size: null,
            resolution: null,
            outputFormat: "png",
          },
          createdAt: now,
        },
      ],
    });

    expect(report.supplierBreakdowns[0]?.image).toEqual({
      url: tinyPng,
      alt: "Selected final render",
    });
  });
});
