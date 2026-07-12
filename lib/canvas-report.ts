import type { Canvas, ImageRecord, Project } from "@/lib/store";
import type { CanvasContent, CanvasEdge, CanvasNode } from "@/lib/nodes/types";
import {
  getWorkspaceProductTypeLabel,
  type CustomerRecord,
  type ProductRecord,
  type ProductVariantRecord,
  type SupplierRecord,
} from "@/lib/workspace-records";

export interface CanvasReportImage {
  url: string | null;
  alt: string;
}

export interface CanvasReportBlock {
  id: string;
  title: string;
  subtitle?: string;
  details: Array<{ label: string; value: string }>;
  image: CanvasReportImage | null;
}

export interface CanvasReportStep {
  id: string;
  title: string;
  detail: string;
}

export interface CanvasReport {
  title: string;
  generatedAt: string;
  project: {
    name: string;
    customerName: string;
    employeeName: string;
    employeeTitle: string;
    employeeEmail: string;
    employeeTel: string;
    currency: string;
    destination: string;
  };
  customerProducts: CanvasReportBlock[];
  supplierBlocks: CanvasReportBlock[];
  pantoneBlocks: CanvasReportBlock[];
  genericBlocks: CanvasReportBlock[];
  outputBlocks: CanvasReportBlock[];
  supplierBreakdowns: CanvasReportBlock[];
  steps: CanvasReportStep[];
  html: string;
  text: string;
}

export interface BuildCanvasReportInput {
  canvas: Pick<Canvas, "id" | "name" | "content" | "createdAt" | "updatedAt">;
  project: Project | null;
  customers: readonly CustomerRecord[];
  suppliers: readonly SupplierRecord[];
  products: readonly ProductRecord[];
  images: readonly ImageRecord[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized ? normalized : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lineBreaks(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function primaryVariant(product: ProductRecord | null): ProductVariantRecord | null {
  return product?.variants[0] ?? null;
}

function variantImage(variant: ProductVariantRecord | null): CanvasReportImage | null {
  if (!variant?.image?.url) return null;
  return { url: variant.image.url, alt: variant.image.name };
}

function parameterDetails(variant: ProductVariantRecord | null) {
  if (!variant) return [];
  return Object.entries(variant.parameters)
    .filter(([, value]) => value.trim())
    .map(([label, value]) => ({ label, value }));
}

function productDetails(product: ProductRecord, ownerName: string): CanvasReportBlock["details"] {
  const variant = primaryVariant(product);
  return [
    { label: "Owner", value: ownerName },
    { label: "Product type", value: getWorkspaceProductTypeLabel(product.productType) },
    { label: "Internal code", value: product.subject },
    { label: "Product details", value: product.detail },
    ...(variant
      ? [
          { label: "Material", value: variant.material },
          { label: "Color notes", value: variant.colorNotes },
          { label: "Production cost", value: `${variant.unitPrice} ${variant.priceUnit}` },
        ]
      : []),
    ...parameterDetails(variant),
  ].filter((item) => item.value.trim());
}

function byNodePosition(left: CanvasNode, right: CanvasNode): number {
  const y = left.position.y - right.position.y;
  return Math.abs(y) > 24 ? y : left.position.x - right.position.x;
}

function linkedLabel(nodesById: Map<string, CanvasNode>, edge: CanvasEdge): string {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  return `${nodeTitle(source)} -> ${nodeTitle(target)}`;
}

function nodeTitle(node: CanvasNode | undefined): string {
  if (!node) return "Unknown node";
  const data = asRecord(node.data);
  const alias = stringValue(data.alias);
  const label = stringValue(data.label);
  const prompt = stringValue(data.prompt);
  const productSubject = stringValue(data.productSubject);
  const genericName = stringValue(data.genericDefinitionName);
  if (alias) return `@${alias}`;
  if (productSubject) return productSubject;
  if (genericName) return genericName;
  if (label) return label;
  if (prompt) return "Generate prompt";
  return node.type;
}

function blockHtml(block: CanvasReportBlock): string {
  const details = block.details
    .map(
      (detail) =>
        `<tr><th>${escapeHtml(detail.label)}</th><td>${lineBreaks(detail.value)}</td></tr>`,
    )
    .join("");
  const image = block.image?.url
    ? `<div class="image"><img src="${escapeHtml(block.image.url)}" alt="${escapeHtml(block.image.alt)}"></div>`
    : `<div class="image empty">No image</div>`;
  return `<article class="block"><div class="details"><h3>${escapeHtml(block.title)}</h3>${block.subtitle ? `<p>${escapeHtml(block.subtitle)}</p>` : ""}<table>${details}</table></div>${image}</article>`;
}

function sectionHtml(title: string, blocks: readonly CanvasReportBlock[]): string {
  if (blocks.length === 0) return "";
  return `<section><h2>${escapeHtml(title)}</h2>${blocks.map(blockHtml).join("")}</section>`;
}

function makeHtml(report: Omit<CanvasReport, "html" | "text">): string {
  const pageCss = `
    body{font-family:Arial,sans-serif;color:#151515;margin:0;background:#f6f5f2}
    .page{max-width:960px;margin:0 auto;background:#fff;padding:28px}
    header{border-bottom:1px solid #ddd;padding-bottom:16px;margin-bottom:22px}
    h1{font-size:24px;margin:0 0 8px} h2{font-size:16px;margin:28px 0 12px}
    h3{font-size:14px;margin:0 0 6px} p{margin:0;color:#555}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;font-size:12px}
    .block{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(220px,.75fr);gap:16px;border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px;break-inside:avoid}
    table{width:100%;border-collapse:collapse;font-size:12px} th{width:34%;text-align:left;color:#666;font-weight:600;vertical-align:top;padding:5px 8px 5px 0} td{padding:5px 0;vertical-align:top}
    .image{min-height:160px;background:#f1f1ef;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#777;font-size:12px}
    img{max-width:100%;max-height:260px;object-fit:contain}
    .steps{font-size:12px;margin:0;padding-left:20px}.steps li{margin-bottom:8px}
    @media print{body{background:#fff}.page{padding:18mm}.block{page-break-inside:avoid}}
  `;
  const project = report.project;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${pageCss}</style></head><body><div class="page"><header><h1>${escapeHtml(report.title)}</h1><div class="meta">
    <span><strong>Customer:</strong> ${escapeHtml(project.customerName)}</span>
    <span><strong>Contact:</strong> ${escapeHtml([project.employeeName, project.employeeTitle].filter(Boolean).join(" / "))}</span>
    <span><strong>Email:</strong> ${escapeHtml(project.employeeEmail)}</span>
    <span><strong>Tel:</strong> ${escapeHtml(project.employeeTel)}</span>
    <span><strong>Currency:</strong> ${escapeHtml(project.currency)}</span>
    <span><strong>Delivery destination:</strong> ${escapeHtml(project.destination)}</span>
    <span><strong>Generated:</strong> ${escapeHtml(formatDateTime(report.generatedAt))}</span>
  </div></header>
  ${sectionHtml("Customer product list", report.customerProducts)}
  ${sectionHtml("Supplier details", report.supplierBlocks)}
  ${sectionHtml("Pantone", report.pantoneBlocks)}
  ${sectionHtml("Generic node", report.genericBlocks)}
  ${sectionHtml("Output and inputed prompt", report.outputBlocks)}
  ${sectionHtml("Supplier breakdown", report.supplierBreakdowns)}
  <section><h2>Canvas log</h2><ol class="steps">${report.steps.map((step) => `<li><strong>${escapeHtml(step.title)}</strong><br>${lineBreaks(step.detail)}</li>`).join("")}</ol></section>
  </div></body></html>`;
}

function makeText(report: Omit<CanvasReport, "html" | "text">): string {
  const lines = [
    report.title,
    `Customer: ${report.project.customerName}`,
    `Contact: ${[report.project.employeeName, report.project.employeeTitle].filter(Boolean).join(" / ")}`,
    `Email: ${report.project.employeeEmail}`,
    `Currency: ${report.project.currency}`,
    `Delivery destination: ${report.project.destination}`,
    "",
  ];
  for (const section of [
    ["Customer product list", report.customerProducts],
    ["Supplier details", report.supplierBlocks],
    ["Pantone", report.pantoneBlocks],
    ["Generic node", report.genericBlocks],
    ["Output and inputed prompt", report.outputBlocks],
    ["Supplier breakdown", report.supplierBreakdowns],
  ] as const) {
    if (section[1].length === 0) continue;
    lines.push(section[0]);
    for (const block of section[1]) {
      lines.push(`- ${block.title}`);
      block.details.forEach((detail) => lines.push(`  ${detail.label}: ${detail.value}`));
      if (block.image?.url) lines.push(`  Image: ${block.image.url}`);
    }
    lines.push("");
  }
  lines.push("Canvas log");
  report.steps.forEach((step, index) => lines.push(`${index + 1}. ${step.title}: ${step.detail}`));
  return lines.join("\n");
}

export function buildCanvasReport(input: BuildCanvasReportInput): CanvasReport {
  const content: CanvasContent = input.canvas.content;
  const nodes = content.nodes.slice().sort(byNodePosition);
  const nodesById = new Map(content.nodes.map((node) => [node.id, node] as const));
  const productsById = new Map(input.products.map((product) => [product.id, product] as const));
  const suppliersById = new Map(input.suppliers.map((supplier) => [supplier.id, supplier] as const));
  const customer = input.project?.customerId
    ? (input.customers.find((candidate) => candidate.id === input.project?.customerId) ?? null)
    : null;

  const customerProducts = input.products
    .filter((product) => product.ownerKind === "customer" && product.customerId === input.project?.customerId)
    .map((product) => ({
      id: `customer-product-${product.id}`,
      title: product.subject,
      subtitle: getWorkspaceProductTypeLabel(product.productType),
      details: productDetails(product, customer?.company.companyName ?? input.project?.customerName ?? "Customer"),
      image: variantImage(primaryVariant(product)),
    }));

  const supplierNodes = nodes.filter((node) => node.type === "suppler");
  const supplierBlocks = supplierNodes.map((node) => {
    const data = asRecord(node.data);
    const supplier = nullableString(data.supplierId)
      ? (suppliersById.get(nullableString(data.supplierId) ?? "") ?? null)
      : null;
    const product = nullableString(data.productId)
      ? (productsById.get(nullableString(data.productId) ?? "") ?? null)
      : null;
    const variant =
      product?.variants.find((item) => item.id === stringValue(data.variantId)) ??
      primaryVariant(product ?? null);
    const supplierName = supplier?.company.companyName ?? stringValue(data.supplierName);
    return {
      id: `supplier-${node.id}`,
      title: stringValue(data.supplierName) || supplier?.company.companyName || "Supplier node",
      subtitle: nodeTitle(node),
      details: product
        ? productDetails(product, supplierName || "Supplier")
        : [
            { label: "Alias", value: stringValue(data.alias) },
            { label: "Supplier", value: stringValue(data.supplierName) },
            { label: "Product", value: stringValue(data.productSubject) },
          ].filter((item) => item.value),
      image: variantImage(variant) ?? (nullableString(data.variantImageUrl) ? { url: nullableString(data.variantImageUrl), alt: stringValue(data.variantImageName) || "Supplier image" } : null),
    };
  });

  const pantoneBlocks = nodes
    .filter((node) => node.type === "pantone")
    .map((node) => {
      const data = asRecord(node.data);
      return {
        id: `pantone-${node.id}`,
        title: stringValue(data.alias) || "Pantone",
        details: [
          { label: "Alias", value: stringValue(data.alias) },
          { label: "Code", value: stringValue(data.code) },
          { label: "Name", value: stringValue(data.name) },
          { label: "Hex", value: stringValue(data.hex) },
        ].filter((item) => item.value),
        image: null,
      };
    });

  const genericBlocks = nodes
    .filter((node) => node.type === "imageInput" && stringValue(asRecord(node.data).genericDefinitionName))
    .map((node) => {
      const data = asRecord(node.data);
      return {
        id: `generic-${node.id}`,
        title: stringValue(data.genericDefinitionName) || stringValue(data.alias) || "Generic node",
        subtitle: stringValue(data.alias) ? `@${stringValue(data.alias)}` : undefined,
        details: [
          { label: "Alias", value: stringValue(data.alias) },
          { label: "Node", value: stringValue(data.genericDefinitionName) },
        ].filter((item) => item.value),
        image: nullableString(data.imageUrl)
          ? { url: nullableString(data.imageUrl), alt: stringValue(data.alias) || "Generic node image" }
          : null,
      };
    });

  const outputBlocks = nodes
    .filter((node) => node.type === "imageOutput" || node.type === "generate")
    .map((node) => {
      const data = asRecord(node.data);
      const prompt = stringValue(data.prompt);
      return {
        id: `output-${node.id}`,
        title: node.type === "generate" ? "Inputed prompt" : "Output",
        details: [
          { label: "Node", value: nodeTitle(node) },
          { label: "Prompt", value: prompt },
          { label: "Model", value: stringValue(data.model) },
          { label: "Status", value: stringValue(data.status) },
          { label: "Output format", value: stringValue(data.outputFormat) },
        ].filter((item) => item.value),
        image: nullableString(data.resultUrl)
          ? { url: nullableString(data.resultUrl), alt: node.type === "generate" ? "Generated image" : "Output image" }
          : null,
      };
    });

  const supplierBreakdowns = supplierBlocks.map((block) => ({
    ...block,
    id: `breakdown-${block.id}`,
    title: `${block.title} breakdown`,
    details: block.details.filter((detail) =>
      ["sampleLeadTime", "sampleCharge", "bulkLeadTime", "unitPrice", "Production cost", "sample lead time", "sample charge", "bulk lead time"].some(
        (label) => detail.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
      ),
    ),
  }));

  const steps: CanvasReportStep[] = [
    ...nodes.map((node, index) => ({
      id: `node-${node.id}`,
      title: `${index + 1}. ${node.type} node`,
      detail: node.type === "generate"
        ? `Created Generate node with prompt: ${stringValue(asRecord(node.data).prompt) || "No prompt entered."}`
        : `Created ${nodeTitle(node)}.`,
    })),
    ...content.edges.map((edge, index) => ({
      id: `edge-${edge.id}`,
      title: `Link ${index + 1}`,
      detail: linkedLabel(nodesById, edge),
    })),
    ...input.images.map((image, index) => ({
      id: `image-${image.id}`,
      title: `Render ${index + 1}`,
      detail: `${formatDateTime(image.createdAt)}${image.prompt ? ` - ${image.prompt}` : ""}`,
    })),
  ];

  const baseReport = {
    title: `${input.canvas.name} canvas report`,
    generatedAt: new Date().toISOString(),
    project: {
      name: input.project?.name ?? "Project",
      customerName: input.project?.customerName ?? customer?.company.companyName ?? "Not set",
      employeeName: input.project?.employeeName ?? "Not set",
      employeeTitle: input.project?.employeeTitle ?? "",
      employeeEmail: input.project?.employeeEmail ?? "Not set",
      employeeTel: input.project?.employeeTel ?? "Not set",
      currency: [input.project?.currencyCode, input.project?.currencySymbol].filter(Boolean).join(" ") || "Not set",
      destination: input.project?.destinationCountryName ?? "Not set",
    },
    customerProducts,
    supplierBlocks,
    pantoneBlocks,
    genericBlocks,
    outputBlocks,
    supplierBreakdowns,
    steps,
  };

  return {
    ...baseReport,
    html: makeHtml(baseReport),
    text: makeText(baseReport),
  };
}
