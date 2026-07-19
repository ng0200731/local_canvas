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

export const SUPPLIER_UPDATE_STAGES = [
  "pmc",
  "production",
  "quality_control",
  "package",
  "shipment",
  "invoice",
] as const satisfies readonly SampleStage[];

export const SAMPLE_STAGE_LABELS: Record<SampleStage, string> = {
  pmc: "Receive order",
  purchase: "Purchase order sent",
  production: "Start production",
  quality_control: "Start QC",
  package: "Start packaging",
  shipment: "Ship out",
  invoice: "Invoice",
};

const requiredText = z.string().trim().min(1).max(500);
const optionalNotes = z.string().trim().max(2_000).default("");
const dateText = z.string().trim().min(1).max(40);
const nonNegative = z.coerce.number().finite().min(0);
const percentage = z.coerce.number().finite().min(0).max(100);
const optionalUrl = z.union([z.literal(""), z.url().max(2_000)]).default("");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLegacySamplePayload(value: unknown): unknown {
  if (!isRecord(value) || typeof value.stage !== "string") return value;
  if (value.stage === "pmc" && "owner" in value) {
    return {
      ...value,
      receivedBy: value.owner,
      pmcDate: value.plannedCompletionDate,
    };
  }
  if (value.stage === "production" && "expectedFinishDate" in value) {
    return {
      ...value,
      plannedFinishDate: value.expectedFinishDate,
    };
  }
  if (value.stage === "quality_control" && "rejectedQuantity" in value) {
    const rejected = Number(value.rejectedQuantity ?? 0);
    const sampleSize = Number(value.sampleSize ?? 0);
    return {
      ...value,
      qcStartDate: value.inspectionDate,
      inspectedQuantity: Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : rejected,
      defectivePercent:
        Number.isFinite(sampleSize) && sampleSize > 0
          ? Math.min(100, Math.max(0, (rejected / sampleSize) * 100))
          : 0,
    };
  }
  if (value.stage === "package" && "readyDate" in value) {
    return {
      ...value,
      packagingStartDate: value.readyDate,
      notes: value.dimensions,
    };
  }
  if (value.stage === "shipment" && "trackingNumber" in value) {
    return {
      ...value,
      awb: value.trackingNumber,
    };
  }
  if (value.stage === "invoice" && "invoiceUrl" in value) {
    return {
      ...value,
      documentUrl: value.invoiceUrl,
    };
  }
  return value;
}

const sampleUpdatePayloadCoreSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("pmc"),
    receivedBy: requiredText,
    pmcDate: dateText,
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
    plannedFinishDate: dateText,
    notes: optionalNotes,
  }),
  z.object({
    stage: z.literal("quality_control"),
    qcStartDate: dateText,
    defectivePercent: percentage,
    inspectedQuantity: nonNegative,
    evidenceUrl: optionalUrl,
  }),
  z.object({
    stage: z.literal("package"),
    packagingStartDate: dateText,
    cartonCount: nonNegative,
    unitsPerCarton: nonNegative.optional(),
    notes: optionalNotes,
  }),
  z.object({
    stage: z.literal("shipment"),
    carrier: requiredText,
    awb: requiredText,
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
    documentUrl: optionalUrl,
  }),
]);

export const sampleUpdatePayloadSchema = z.preprocess(
  normalizeLegacySamplePayload,
  sampleUpdatePayloadCoreSchema,
);

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
      return `Received by ${payload.receivedBy} on ${payload.pmcDate}`;
    case "purchase":
      return `${payload.orderedQuantity} ${payload.unit} ordered`;
    case "production":
      return `Started ${payload.startDate}`;
    case "quality_control":
      return `${payload.defectivePercent}% defective`;
    case "package":
      return `${payload.cartonCount} cartons`;
    case "shipment":
      return `${payload.carrier} · AWB ${payload.awb}`;
    case "invoice":
      return `${payload.invoiceNumber} · ${payload.currency} ${payload.amount}`;
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
