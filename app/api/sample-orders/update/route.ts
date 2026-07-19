import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { deliverPhysicalSampleApprovalEmail } from "@/lib/email/mailer";
import { env, isLocalPostgresConfigured, isSupabaseConfigured } from "@/lib/env";
import {
  markLocalSampleOrderApprovalEmail,
  submitLocalSampleOrderUpdate,
} from "@/lib/sample-order-postgres";
import { sampleOrderSnapshotSchema, sampleUpdatePayloadSchema } from "@/lib/sample-orders";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    token: z.string().min(32).max(200),
    payload: sampleUpdatePayloadSchema,
  })
  .strict();

const orderRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  sequence: z.string(),
  recipient_email: z.string(),
  approver_email: z.string(),
  approval_status: z.enum(["not_requested", "pending", "approved", "rejected"]),
  snapshot: sampleOrderSnapshotSchema,
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the selected status and required fields." },
      { status: 400 },
    );
  }

  try {
    if (isLocalPostgresConfigured) {
      const approvalToken =
        parsed.data.payload.stage === "shipment" ? randomBytes(32).toString("hex") : null;
      const submitted = await submitLocalSampleOrderUpdate({
        supplierTokenHash: hashToken(parsed.data.token),
        payload: parsed.data.payload,
        approvalTokenHash: approvalToken ? hashToken(approvalToken) : null,
      });

      let approvalEmailStatus: "sent" | "failed" | null = null;
      if (submitted.needsApproval && approvalToken && parsed.data.payload.stage === "shipment") {
        const origin = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
        try {
          await deliverPhysicalSampleApprovalEmail({
            to: submitted.approverEmail,
            sequence: submitted.sequence,
            projectName: submitted.snapshot.project.name,
            canvasName: submitted.snapshot.canvas.name,
            supplierName: submitted.snapshot.supplier.name,
            awb: parsed.data.payload.awb,
            approvalUrl: `${origin}/api/sample-orders/approval?token=${approvalToken}&decision=approved`,
            rejectionUrl: `${origin}/api/sample-orders/approval?token=${approvalToken}&decision=rejected`,
          });
          approvalEmailStatus = "sent";
          await markLocalSampleOrderApprovalEmail({
            orderId: submitted.orderId,
            status: "sent",
            sentAt: new Date().toISOString(),
            error: null,
          });
        } catch (error) {
          approvalEmailStatus = "failed";
          await markLocalSampleOrderApprovalEmail({
            orderId: submitted.orderId,
            status: "failed",
            error: error instanceof Error ? error.message : "Approval email failed",
          });
        }
      }

      return NextResponse.json({
        success: true,
        createdAt: submitted.createdAt,
        approvalEmailStatus,
      });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json(
        { error: "Sample-order storage is not configured." },
        { status: 503 },
      );
    }

    const supabase = getSupabaseServiceClient();
    const found = await supabase
      .from("sample_orders")
      .select("id, user_id, sequence, recipient_email, approver_email, approval_status, snapshot")
      .eq("supplier_token_hash", hashToken(parsed.data.token))
      .maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data)
      return NextResponse.json({ error: "This sample-order link is invalid." }, { status: 404 });
    const order = orderRowSchema.parse(found.data);
    const createdAt = new Date().toISOString();
    const inserted = await supabase.from("sample_order_updates").insert({
      order_id: order.id,
      user_id: order.user_id,
      stage: parsed.data.payload.stage,
      payload: parsed.data.payload,
      source: "supplier_web",
      created_at: createdAt,
    });
    if (inserted.error) throw new Error(inserted.error.message);

    const shouldRequestApproval =
      parsed.data.payload.stage === "shipment" && order.approval_status !== "approved";
    const orderPatch: Record<string, unknown> = {
      current_stage: parsed.data.payload.stage,
      current_payload: parsed.data.payload,
      latest_update_at: createdAt,
    };
    let approvalToken: string | null = null;
    if (shouldRequestApproval) {
      approvalToken = randomBytes(32).toString("hex");
      orderPatch.approval_status = "pending";
      orderPatch.approval_token_hash = hashToken(approvalToken);
      orderPatch.approval_email_status = "pending";
      orderPatch.approval_error = null;
      orderPatch.approval_responded_at = null;
    }
    const updated = await supabase.from("sample_orders").update(orderPatch).eq("id", order.id);
    if (updated.error) throw new Error(updated.error.message);

    let approvalEmailStatus: "sent" | "failed" | null = null;
    if (shouldRequestApproval && approvalToken && parsed.data.payload.stage === "shipment") {
      const origin = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      try {
        await deliverPhysicalSampleApprovalEmail({
          to: order.approver_email,
          sequence: order.sequence,
          projectName: order.snapshot.project.name,
          canvasName: order.snapshot.canvas.name,
          supplierName: order.snapshot.supplier.name,
          awb: parsed.data.payload.awb,
          approvalUrl: `${origin}/api/sample-orders/approval?token=${approvalToken}&decision=approved`,
          rejectionUrl: `${origin}/api/sample-orders/approval?token=${approvalToken}&decision=rejected`,
        });
        approvalEmailStatus = "sent";
        await supabase
          .from("sample_orders")
          .update({
            approval_email_status: "sent",
            approval_sent_at: new Date().toISOString(),
            approval_error: null,
          })
          .eq("id", order.id);
      } catch (error) {
        approvalEmailStatus = "failed";
        await supabase
          .from("sample_orders")
          .update({
            approval_email_status: "failed",
            approval_error: error instanceof Error ? error.message : "Approval email failed",
          })
          .eq("id", order.id);
      }
    }

    return NextResponse.json({ success: true, createdAt, approvalEmailStatus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sample update failed." },
      { status: 500 },
    );
  }
}
