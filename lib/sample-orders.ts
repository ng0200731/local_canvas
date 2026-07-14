import { z } from "zod";

export const SAMPLE_STAGES = [
  "pmc",
  "purchase",
  "production",
  "quality_control",
  "package",
  "shipment",
  "invoice",
] as const;

export const sampleStageSchema = z.enum(SAMPLE_STAGES);
export type SampleStage = z.infer<typeof sampleStageSchema>;

export const SAMPLE_STAGE_LABELS: Record<SampleStage, string> = {
  pmc: "PMC",
  purchase: "Purchase",
  production: "Production",
  quality_control: "Quality control",
  package: "Package",
  shipment: "Shipment",
  invoice: "Invoice",
};

const requiredText = z.string().trim().min(1).max(500);
const optionalNotes = z.string().trim().max(2_000).default("");
const dateText = z.string().trim().min(1).max(40);
const nonNegative = z.coerce.number().finite().min(0);
const percentage = z.coerce.number().finite().min(0).max(100);
const optionalUrl = z.union([z.literal(""), z.url().max(2_000)]).default("");

export const sampleUpdatePayloadSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("pmc"),
    owner: requiredText,
    plannedCompletionDate: dateText,
    materialReadinessPercent: percentage,
    notes: optionalNotes,
  }),
  z.object({
    stage: z.literal("purchase"),
    materialItem: requiredText,
    supplierReference: requiredText,
    orderedQuantity: nonNegative,
    unit: requiredText,
    orderDate: dateText,
    expectedDeliveryDate: dateText,
  }),
  z.object({
    stage: z.literal("production"),
    startDate: dateText,
    plannedQuantity: nonNegative,
    completedQuantity: nonNegative,
    progressPercent: percentage,
    expectedFinishDate: dateText,
    notes: optionalNotes,
  }),
  z.object({
    stage: z.literal("quality_control"),
    inspectionDate: dateText,
    inspector: requiredText,
    sampleSize: nonNegative,
    passedQuantity: nonNegative,
    rejectedQuantity: nonNegative,
    result: z.enum(["pending", "passed", "failed"]),
    evidenceUrl: optionalUrl,
  }),
  z.object({
    stage: z.literal("package"),
    packagingType: requiredText,
    cartonCount: nonNegative,
    unitsPerCarton: nonNegative,
    netWeight: nonNegative,
    grossWeight: nonNegative,
    dimensions: requiredText,
    readyDate: dateText,
  }),
  z.object({
    stage: z.literal("shipment"),
    carrier: requiredText,
    shippingMethod: requiredText,
    trackingNumber: requiredText,
    shippedQuantity: nonNegative,
    shipDate: dateText,
    eta: dateText,
    documentUrl: optionalUrl,
  }),
  z.object({
    stage: z.literal("invoice"),
    invoiceNumber: requiredText,
    invoiceDate: dateText,
    currency: requiredText,
    amount: nonNegative,
    dueDate: dateText,
    invoiceUrl: optionalUrl,
  }),
]);

export type SampleUpdatePayload = z.infer<typeof sampleUpdatePayloadSchema>;

export const sampleEmailStatusSchema = z.enum(["pending", "sent", "failed"]);
export type SampleEmailStatus = z.infer<typeof sampleEmailStatusSchema>;

export const sampleApprovalStatusSchema = z.enum([
  "not_requested",
  "pending",
  "approved",
  "rejected",
]);
export type SampleApprovalStatus = z.infer<typeof sampleApprovalStatusSchema>;

export const sampleOrderLineSchema = z
  .object({
    nodeId: z.string().min(1),
    productId: z.string().nullable(),
    variantId: z.string().nullable(),
    subject: z.string().min(1),
    details: z.array(z.string().min(1).max(1_000)).max(40),
  })
  .strict();

export type SampleOrderLine = z.infer<typeof sampleOrderLineSchema>;

export const sampleOrderSnapshotSchema = z
  .object({
    project: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        customerName: z.string().nullable(),
      })
      .strict(),
    canvas: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        reportUrl: z.string().min(1),
      })
      .strict(),
    supplier: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        email: z.email(),
        productTypes: z.array(z.string()),
        employees: z.array(
          z
            .object({
              name: z.string().min(1),
              title: z.string(),
              email: z.email(),
              tel: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
    lines: z.array(sampleOrderLineSchema).min(1),
  })
  .strict();

export type SampleOrderSnapshot = z.infer<typeof sampleOrderSnapshotSchema>;

export const sampleOrderUpdateSchema = z
  .object({
    id: z.string().min(1),
    orderId: z.string().min(1),
    stage: sampleStageSchema,
    payload: sampleUpdatePayloadSchema,
    source: z.enum(["supplier_web", "demo"]),
    createdAt: z.string().min(1),
  })
  .strict();

export type SampleOrderUpdate = z.infer<typeof sampleOrderUpdateSchema>;

export const sampleOrderSchema = z
  .object({
    id: z.string().min(1),
    canvasSendId: z.string().nullable(),
    canvasId: z.string().nullable(),
    projectId: z.string().nullable(),
    supplierId: z.string().nullable(),
    sequence: z.string().regex(/^CA\d{6}$/),
    recipientEmail: z.email(),
    approverEmail: z.email(),
    snapshot: sampleOrderSnapshotSchema,
    emailStatus: sampleEmailStatusSchema,
    emailError: z.string().nullable(),
    deliveryCount: z.number().int().min(0),
    purchaseSentAt: z.string().nullable(),
    currentStage: sampleStageSchema.nullable(),
    currentPayload: sampleUpdatePayloadSchema.nullable(),
    latestUpdateAt: z.string().nullable(),
    approvalStatus: sampleApprovalStatusSchema,
    approvalEmailStatus: sampleEmailStatusSchema.nullable(),
    approvalError: z.string().nullable(),
    approvalSentAt: z.string().nullable(),
    approvalRespondedAt: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    updates: z.array(sampleOrderUpdateSchema),
  })
  .strict();

export type SampleOrder = z.infer<typeof sampleOrderSchema>;

export interface UpsertSampleOrderInput {
  canvasSendId: string;
  canvasId: string;
  projectId: string;
  supplierId: string;
  sequence: string;
  recipientEmail: string;
  approverEmail: string;
  supplierTokenHash: string;
  snapshot: SampleOrderSnapshot;
}

export interface UpdateSampleOrderEmailInput {
  status: SampleEmailStatus;
  error?: string | null;
  sentAt?: string | null;
}

export interface RotateSampleOrderTokenInput {
  supplierTokenHash: string;
}

export function payloadSummary(payload: SampleUpdatePayload): string {
  switch (payload.stage) {
    case "pmc":
      return `${payload.materialReadinessPercent}% material ready`;
    case "purchase":
      return `${payload.orderedQuantity} ${payload.unit} ordered`;
    case "production":
      return `${payload.progressPercent}% complete`;
    case "quality_control":
      return `${payload.result} · ${payload.passedQuantity} passed`;
    case "package":
      return `${payload.cartonCount} cartons`;
    case "shipment":
      return `${payload.carrier} · ${payload.trackingNumber}`;
    case "invoice":
      return `${payload.currency} ${payload.amount}`;
  }
}

export async function sha256Token(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPublicToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
