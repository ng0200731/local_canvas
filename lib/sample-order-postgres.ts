import "server-only";

import type { QueryResultRow } from "pg";
import { z } from "zod";

import { query, queryOne, withTransaction } from "@/lib/db/client";
import { localUserId } from "@/lib/env";
import {
  sampleApprovalStatusSchema,
  sampleEmailStatusSchema,
  sampleOrderSchema,
  sampleOrderSnapshotSchema,
  sampleStageSchema,
  sampleUpdatePayloadSchema,
  type RotateSampleOrderTokenInput,
  type SampleOrder,
  type SampleOrderSnapshot,
  type SampleUpdatePayload,
  type UpdateSampleOrderEmailInput,
  type UpsertSampleOrderInput,
} from "@/lib/sample-orders";

const sampleOrderUpdateDbSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  stage: sampleStageSchema,
  payload: sampleUpdatePayloadSchema,
  source: z.enum(["supplier_web", "demo"]),
  created_at: z.string(),
});

const sampleOrderDbSchema = z.object({
  id: z.string(),
  canvas_send_id: z.string().nullable(),
  canvas_id: z.string().nullable(),
  project_id: z.string().nullable(),
  supplier_id: z.string().nullable(),
  sequence: z.string(),
  recipient_email: z.string(),
  approver_email: z.string(),
  snapshot: sampleOrderSnapshotSchema,
  email_status: sampleEmailStatusSchema,
  email_error: z.string().nullable(),
  delivery_count: z.number(),
  purchase_sent_at: z.string().nullable(),
  current_stage: sampleStageSchema.nullable(),
  current_payload: sampleUpdatePayloadSchema.nullable(),
  latest_update_at: z.string().nullable(),
  approval_status: sampleApprovalStatusSchema,
  approval_email_status: sampleEmailStatusSchema.nullable(),
  approval_error: z.string().nullable(),
  approval_sent_at: z.string().nullable(),
  approval_responded_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  sample_order_updates: z.array(sampleOrderUpdateDbSchema),
});

const publicOrderSchema = z.object({
  sequence: z.string(),
  snapshot: sampleOrderSnapshotSchema,
  current_stage: sampleStageSchema.nullable(),
  current_payload: sampleUpdatePayloadSchema.nullable(),
  approval_status: sampleApprovalStatusSchema,
  purchase_sent_at: z.string().nullable(),
  sample_order_updates: z.array(
    z.object({
      id: z.string(),
      stage: sampleStageSchema,
      payload: sampleUpdatePayloadSchema,
      created_at: z.string(),
    }),
  ),
});

const shipmentPayloadSchema = z.object({
  stage: z.literal("shipment"),
  carrier: z.string().trim().min(1).max(500),
  awb: z.string().trim().min(1).max(500),
  shipDate: z.string().trim().min(1).max(40),
  eta: z.string().trim().min(1).max(40),
  documentUrl: z.union([z.literal(""), z.url().max(2_000)]).default(""),
});

type SampleOrderDbRow = QueryResultRow & {
  id: string;
  canvas_send_id: string | null;
  canvas_id: string | null;
  project_id: string | null;
  supplier_id: string | null;
  sequence: string;
  recipient_email: string;
  approver_email: string;
  snapshot: unknown;
  email_status: string;
  email_error: string | null;
  delivery_count: number;
  purchase_sent_at: Date | string | null;
  current_stage: string | null;
  current_payload: unknown;
  latest_update_at: Date | string | null;
  approval_status: string;
  approval_email_status: string | null;
  approval_error: string | null;
  approval_sent_at: Date | string | null;
  approval_responded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type SampleOrderUpdateDbRow = QueryResultRow & {
  id: string;
  order_id: string;
  stage: string;
  payload: unknown;
  source: string;
  created_at: Date | string;
};

type ExistingSampleOrderRow = QueryResultRow & {
  id: string;
  delivery_count: number;
};

type SupplierOrderRow = QueryResultRow & {
  id: string;
  user_id: string;
  sequence: string;
  recipient_email: string;
  approver_email: string;
  approval_status: string;
  snapshot: unknown;
};

type ApprovalRetryRow = SupplierOrderRow & {
  current_payload: unknown;
};

type ApprovalResponseRow = QueryResultRow & {
  id: string;
  sequence: string;
  approval_status: string;
};

export type PublicSampleOrder = z.infer<typeof publicOrderSchema>;

export interface SubmittedSampleOrderUpdate {
  orderId: string;
  sequence: string;
  approverEmail: string;
  recipientEmail: string;
  snapshot: SampleOrderSnapshot;
  needsApproval: boolean;
  createdAt: string;
}

export interface ApprovalRetrySampleOrder {
  id: string;
  sequence: string;
  approverEmail: string;
  snapshot: SampleOrderSnapshot;
  currentPayload: z.infer<typeof shipmentPayloadSchema>;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}

function mapUpdateRow(row: SampleOrderUpdateDbRow) {
  return {
    id: row.id,
    order_id: row.order_id,
    stage: row.stage,
    payload: row.payload,
    source: row.source,
    created_at: toIso(row.created_at),
  };
}

function mapOrderRow(row: SampleOrderDbRow, updates: SampleOrderUpdateDbRow[]): SampleOrder {
  const parsed = sampleOrderDbSchema.parse({
    id: row.id,
    canvas_send_id: row.canvas_send_id,
    canvas_id: row.canvas_id,
    project_id: row.project_id,
    supplier_id: row.supplier_id,
    sequence: row.sequence,
    recipient_email: row.recipient_email,
    approver_email: row.approver_email,
    snapshot: row.snapshot,
    email_status: row.email_status,
    email_error: row.email_error,
    delivery_count: Number(row.delivery_count),
    purchase_sent_at: toIsoOrNull(row.purchase_sent_at),
    current_stage: row.current_stage,
    current_payload: row.current_payload,
    latest_update_at: toIsoOrNull(row.latest_update_at),
    approval_status: row.approval_status,
    approval_email_status: row.approval_email_status,
    approval_error: row.approval_error,
    approval_sent_at: toIsoOrNull(row.approval_sent_at),
    approval_responded_at: toIsoOrNull(row.approval_responded_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    sample_order_updates: updates.map(mapUpdateRow),
  });

  return sampleOrderSchema.parse({
    id: parsed.id,
    canvasSendId: parsed.canvas_send_id,
    canvasId: parsed.canvas_id,
    projectId: parsed.project_id,
    supplierId: parsed.supplier_id,
    sequence: parsed.sequence,
    recipientEmail: parsed.recipient_email,
    approverEmail: parsed.approver_email,
    snapshot: parsed.snapshot,
    emailStatus: parsed.email_status,
    emailError: parsed.email_error,
    deliveryCount: parsed.delivery_count,
    purchaseSentAt: parsed.purchase_sent_at,
    currentStage: parsed.current_stage,
    currentPayload: parsed.current_payload,
    latestUpdateAt: parsed.latest_update_at,
    approvalStatus: parsed.approval_status,
    approvalEmailStatus: parsed.approval_email_status,
    approvalError: parsed.approval_error,
    approvalSentAt: parsed.approval_sent_at,
    approvalRespondedAt: parsed.approval_responded_at,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    updates: parsed.sample_order_updates.map((update) => ({
      id: update.id,
      orderId: update.order_id,
      stage: update.stage,
      payload: update.payload,
      source: update.source,
      createdAt: update.created_at,
    })),
  });
}

async function getUpdates(orderId: string): Promise<SampleOrderUpdateDbRow[]> {
  return await query<SampleOrderUpdateDbRow>(
    `SELECT id, order_id, stage, payload, source, created_at
     FROM public.sample_order_updates
     WHERE order_id = $1
     ORDER BY created_at DESC`,
    [orderId],
  );
}

async function getLocalSampleOrderById(id: string): Promise<SampleOrder> {
  const row = await queryOne<SampleOrderDbRow>(
    `SELECT id, canvas_send_id, canvas_id, project_id, supplier_id, sequence,
            recipient_email, approver_email, snapshot, email_status, email_error,
            delivery_count, purchase_sent_at, current_stage, current_payload,
            latest_update_at, approval_status, approval_email_status, approval_error,
            approval_sent_at, approval_responded_at, created_at, updated_at
     FROM public.sample_orders
     WHERE id = $1 AND user_id = $2`,
    [id, localUserId],
  );
  if (!row) throw new Error("Sample order not found");
  return mapOrderRow(row, await getUpdates(row.id));
}

export async function listLocalSampleOrders(): Promise<SampleOrder[]> {
  const rows = await query<SampleOrderDbRow>(
    `SELECT id, canvas_send_id, canvas_id, project_id, supplier_id, sequence,
            recipient_email, approver_email, snapshot, email_status, email_error,
            delivery_count, purchase_sent_at, current_stage, current_payload,
            latest_update_at, approval_status, approval_email_status, approval_error,
            approval_sent_at, approval_responded_at, created_at, updated_at
     FROM public.sample_orders
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [localUserId],
  );
  return await Promise.all(rows.map(async (row) => mapOrderRow(row, await getUpdates(row.id))));
}

export async function upsertLocalSampleOrder(input: UpsertSampleOrderInput): Promise<SampleOrder> {
  const existing = await queryOne<ExistingSampleOrderRow>(
    `SELECT id, delivery_count
     FROM public.sample_orders
     WHERE canvas_send_id = $1 AND supplier_id = $2 AND user_id = $3
     LIMIT 1`,
    [input.canvasSendId, input.supplierId, localUserId],
  );

  if (existing) {
    await query(
      `UPDATE public.sample_orders
       SET canvas_id = $3,
           project_id = $4,
           sequence = $5,
           recipient_email = $6,
           approver_email = $7,
           supplier_token_hash = $8,
           snapshot = $9::jsonb,
           email_status = 'pending',
           email_error = null,
           current_stage = 'purchase',
           current_payload = null,
           delivery_count = $10
       WHERE id = $1 AND user_id = $2`,
      [
        existing.id,
        localUserId,
        input.canvasId,
        input.projectId,
        input.sequence,
        input.recipientEmail,
        input.approverEmail,
        input.supplierTokenHash,
        JSON.stringify(input.snapshot),
        Number(existing.delivery_count) + 1,
      ],
    );
    return await getLocalSampleOrderById(existing.id);
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO public.sample_orders (
       user_id, canvas_send_id, canvas_id, project_id, supplier_id, sequence,
       recipient_email, approver_email, supplier_token_hash, snapshot, current_stage, delivery_count
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10::jsonb, 'purchase', 1
     )
     RETURNING id`,
    [
      localUserId,
      input.canvasSendId,
      input.canvasId,
      input.projectId,
      input.supplierId,
      input.sequence,
      input.recipientEmail,
      input.approverEmail,
      input.supplierTokenHash,
      JSON.stringify(input.snapshot),
    ],
  );
  if (!row) throw new Error("Failed to create sample order");
  return await getLocalSampleOrderById(row.id);
}

export async function updateLocalSampleOrderEmail(
  id: string,
  input: UpdateSampleOrderEmailInput,
): Promise<SampleOrder> {
  await query(
    `UPDATE public.sample_orders
     SET email_status = $3,
         email_error = $4,
         purchase_sent_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE purchase_sent_at END
     WHERE id = $1 AND user_id = $2`,
    [id, localUserId, input.status, input.error ?? null, input.sentAt !== undefined, input.sentAt ?? null],
  );
  return await getLocalSampleOrderById(id);
}

export async function rotateLocalSampleOrderToken(
  id: string,
  input: RotateSampleOrderTokenInput,
): Promise<SampleOrder> {
  const existing = await getLocalSampleOrderById(id);
  await query(
    `UPDATE public.sample_orders
     SET supplier_token_hash = $3,
         email_status = 'pending',
         email_error = null,
         delivery_count = $4
     WHERE id = $1 AND user_id = $2`,
    [id, localUserId, input.supplierTokenHash, existing.deliveryCount + 1],
  );
  return await getLocalSampleOrderById(id);
}

export async function getLocalPublicSampleOrder(
  supplierTokenHash: string,
): Promise<PublicSampleOrder | null> {
  const row = await queryOne<SampleOrderDbRow>(
    `SELECT id, canvas_send_id, canvas_id, project_id, supplier_id, sequence,
            recipient_email, approver_email, snapshot, email_status, email_error,
            delivery_count, purchase_sent_at, current_stage, current_payload,
            latest_update_at, approval_status, approval_email_status, approval_error,
            approval_sent_at, approval_responded_at, created_at, updated_at
     FROM public.sample_orders
     WHERE supplier_token_hash = $1 AND user_id = $2
     LIMIT 1`,
    [supplierTokenHash, localUserId],
  );
  if (!row) return null;
  return publicOrderSchema.parse({
    sequence: row.sequence,
    snapshot: row.snapshot,
    current_stage: row.current_stage,
    current_payload: row.current_payload,
    approval_status: row.approval_status,
    purchase_sent_at: toIsoOrNull(row.purchase_sent_at),
    sample_order_updates: (await getUpdates(row.id)).map((update) => ({
      id: update.id,
      stage: update.stage,
      payload: update.payload,
      created_at: toIso(update.created_at),
    })),
  });
}

export async function submitLocalSampleOrderUpdate(input: {
  supplierTokenHash: string;
  payload: SampleUpdatePayload;
  approvalTokenHash: string | null;
}): Promise<SubmittedSampleOrderUpdate> {
  return await withTransaction(async (client) => {
    const found = await client.query<SupplierOrderRow>(
      `SELECT id, user_id, sequence, recipient_email, approver_email, approval_status, snapshot
       FROM public.sample_orders
       WHERE supplier_token_hash = $1 AND user_id = $2
       FOR UPDATE`,
      [input.supplierTokenHash, localUserId],
    );
    const row = found.rows[0];
    if (!row) throw new Error("This sample-order link is invalid.");
    const order = z
      .object({
        id: z.string(),
        user_id: z.string(),
        sequence: z.string(),
        recipient_email: z.string(),
        approver_email: z.string(),
        approval_status: sampleApprovalStatusSchema,
        snapshot: sampleOrderSnapshotSchema,
      })
      .parse(row);
    const createdAt = new Date().toISOString();
    await client.query(
      `INSERT INTO public.sample_order_updates(order_id, user_id, stage, payload, source, created_at)
       VALUES ($1, $2, $3, $4::jsonb, 'supplier_web', $5::timestamptz)`,
      [order.id, order.user_id, input.payload.stage, JSON.stringify(input.payload), createdAt],
    );
    const needsApproval = input.payload.stage === "shipment" && order.approval_status !== "approved";
    await client.query(
      `UPDATE public.sample_orders
       SET current_stage = $3,
           current_payload = $4::jsonb,
           latest_update_at = $5::timestamptz,
           approval_status = CASE WHEN $6::boolean THEN 'pending' ELSE approval_status END,
           approval_token_hash = CASE WHEN $6::boolean THEN $7 ELSE approval_token_hash END,
           approval_email_status = CASE WHEN $6::boolean THEN 'pending' ELSE approval_email_status END,
           approval_error = CASE WHEN $6::boolean THEN null ELSE approval_error END,
           approval_responded_at = CASE WHEN $6::boolean THEN null ELSE approval_responded_at END
       WHERE id = $1 AND user_id = $2`,
      [
        order.id,
        localUserId,
        input.payload.stage,
        JSON.stringify(input.payload),
        createdAt,
        needsApproval,
        input.approvalTokenHash,
      ],
    );
    return {
      orderId: order.id,
      sequence: order.sequence,
      approverEmail: order.approver_email,
      recipientEmail: order.recipient_email,
      snapshot: order.snapshot,
      needsApproval,
      createdAt,
    };
  });
}

export async function markLocalSampleOrderApprovalEmail(input: {
  orderId: string;
  status: "sent" | "failed";
  error: string | null;
  sentAt?: string | null;
}): Promise<void> {
  await query(
    `UPDATE public.sample_orders
     SET approval_email_status = $3,
         approval_sent_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE approval_sent_at END,
         approval_error = $6
     WHERE id = $1 AND user_id = $2`,
    [
      input.orderId,
      localUserId,
      input.status,
      input.sentAt !== undefined,
      input.sentAt ?? null,
      input.error,
    ],
  );
}

export async function getLocalApprovalRetrySampleOrder(
  orderId: string,
): Promise<ApprovalRetrySampleOrder> {
  const row = await queryOne<ApprovalRetryRow>(
    `SELECT id, user_id, sequence, recipient_email, approver_email, approval_status, snapshot,
            current_payload
     FROM public.sample_orders
     WHERE id = $1 AND user_id = $2`,
    [orderId, localUserId],
  );
  if (!row) throw new Error("Sample order not found");
  const parsed = z
    .object({
      id: z.string(),
      sequence: z.string(),
      approver_email: z.string(),
      snapshot: sampleOrderSnapshotSchema,
      current_payload: shipmentPayloadSchema,
    })
    .parse(row);
  return {
    id: parsed.id,
    sequence: parsed.sequence,
    approverEmail: parsed.approver_email,
    snapshot: parsed.snapshot,
    currentPayload: parsed.current_payload,
  };
}

export async function prepareLocalSampleOrderApproval(
  orderId: string,
  approvalTokenHash: string,
): Promise<void> {
  await query(
    `UPDATE public.sample_orders
     SET approval_status = 'pending',
         approval_token_hash = $3,
         approval_email_status = 'pending',
         approval_error = null,
         approval_responded_at = null
     WHERE id = $1 AND user_id = $2`,
    [orderId, localUserId, approvalTokenHash],
  );
}

export async function respondLocalSampleOrderApproval(
  approvalTokenHash: string,
  status: "approved" | "rejected",
): Promise<{ sequence: string; status: string; alreadyResponded: boolean }> {
  return await withTransaction(async (client) => {
    const found = await client.query<ApprovalResponseRow>(
      `SELECT id, sequence, approval_status
       FROM public.sample_orders
       WHERE approval_token_hash = $1 AND user_id = $2
       FOR UPDATE`,
      [approvalTokenHash, localUserId],
    );
    const row = found.rows[0];
    if (!row) throw new Error("Approval link not found.");
    const currentStatus = sampleApprovalStatusSchema.parse(row.approval_status);
    if (currentStatus !== "pending") {
      return { sequence: row.sequence, status: currentStatus, alreadyResponded: true };
    }
    await client.query(
      `UPDATE public.sample_orders
       SET approval_status = $3,
           approval_responded_at = now()
       WHERE id = $1 AND user_id = $2`,
      [row.id, localUserId, status],
    );
    return { sequence: row.sequence, status, alreadyResponded: false };
  });
}
