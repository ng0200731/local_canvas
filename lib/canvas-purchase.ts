import type { Canvas } from "@/lib/store";
import type { SampleOrderLine } from "@/lib/sample-orders";
import type { ProductRecord, SupplierRecord } from "@/lib/workspace-records";

export interface CanvasPurchaseTarget {
  email: string;
  supplier: SupplierRecord;
  supplierName: string;
  details: string[];
  lines: SampleOrderLine[];
}

export function supplierEmail(supplier: SupplierRecord): string | null {
  const employee = supplier.employees[0];
  if (!employee) return null;
  return `${employee.emailPrefix}@${supplier.company.emailDomainSuffix}`;
}

export function appendSupplierParam(reportUrl: string, supplierId: string): string {
  try {
    const url = new URL(reportUrl);
    url.searchParams.set("supplier", supplierId);
    return url.toString();
  } catch {
    const separator = reportUrl.includes("?") ? "&" : "?";
    return `${reportUrl}${separator}supplier=${encodeURIComponent(supplierId)}`;
  }
}

export function canvasPurchaseTargets(input: {
  canvas: Canvas;
  suppliers: readonly SupplierRecord[];
  products: readonly ProductRecord[];
}): CanvasPurchaseTarget[] {
  const suppliersById = new Map(input.suppliers.map((supplier) => [supplier.id, supplier]));
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const targets = new Map<string, CanvasPurchaseTarget>();

  const nodeIds = new Set(input.canvas.content.nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  for (const edge of input.canvas.content.edges) {
    if (!edge.source || !edge.target) continue;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    adjacency.get(edge.source)!.add(edge.target);
  }

  const generateNodeIds = new Set(
    input.canvas.content.nodes.filter((node) => node.type === "generate").map((node) => node.id),
  );
  const reachesGenerate = new Set<string>();
  const stack = [...generateNodeIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachesGenerate.has(id)) continue;
    reachesGenerate.add(id);
    for (const source of adjacency.keys()) {
      if (adjacency.get(source)!.has(id)) {
        stack.push(source);
      }
    }
  }

  for (const node of input.canvas.content.nodes) {
    if (node.type !== "suppler") continue;
    if (!reachesGenerate.has(node.id)) continue;
    const supplierId = typeof node.data.supplierId === "string" ? node.data.supplierId : null;
    const supplier = supplierId ? suppliersById.get(supplierId) : undefined;
    if (!supplier) continue;
    const email = supplierEmail(supplier);
    if (!email) continue;

    const productId = typeof node.data.productId === "string" ? node.data.productId : null;
    const product = productId ? productsById.get(productId) : undefined;
    const variantId = typeof node.data.variantId === "string" ? node.data.variantId : null;
    const variant =
      product?.variants.find((candidate) => candidate.id === variantId) ?? product?.variants[0];
    const employee = supplier.employees[0];
    const details = [
      `Supplier: ${supplier.company.companyName}`,
      `Email: ${email}`,
      employee ? `Contact: ${employee.userName} / ${employee.title}` : "",
      employee ? `Tel: ${employee.tel}` : "",
      product ? `Product: ${product.subject}` : "",
      product ? `Product detail: ${product.detail}` : "",
      variant ? `Material: ${variant.material}` : "",
      variant ? `Color notes: ${variant.colorNotes}` : "",
      variant ? `Unit price: ${variant.unitPrice} ${variant.priceUnit}` : "",
      typeof node.data.productSubject === "string"
        ? `Canvas item: ${node.data.productSubject}`
        : "",
    ].filter(Boolean);

    const subject =
      typeof node.data.productSubject === "string" && node.data.productSubject.trim()
        ? node.data.productSubject.trim()
        : product?.subject || "Canvas purchase item";
    const line: SampleOrderLine = {
      nodeId: node.id,
      productId,
      variantId,
      subject,
      details,
    };
    const existing = targets.get(supplier.id);
    if (existing) {
      existing.lines.push(line);
      existing.details = [...new Set([...existing.details, ...details])];
      continue;
    }

    targets.set(supplier.id, {
      email,
      supplier,
      supplierName: supplier.company.companyName,
      details,
      lines: [line],
    });
  }

  return [...targets.values()];
}
