import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { deliverPhysicalSampleApprovalEmail } from "@/lib/email/mailer";
import { sampleOrderSnapshotSchema, sampleUpdatePayloadSchema } from "@/lib/sample-orders";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({ orderId: z.uuid() }).strict();
const rowSchema = z.object({
  id: z.string(),
  sequence: z.string(),
  approver_email: z.string(),
  snapshot: sampleOrderSnapshotSchema,
  current_payload: sampleUpdatePayloadSchema,
});

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid sample order." }, { status: 400 });
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const found = await supabase
      .from("sample_orders")
      .select("id, sequence, approver_email, snapshot, current_payload")
      .eq("id", body.data.orderId)
      .single();
    if (found.error) throw new Error(found.error.message);
    const order = rowSchema.parse(found.data);
    if (order.current_payload.stage !== "shipment")
      return NextResponse.json(
        { error: "Shipment details are required before approval." },
        { status: 409 },
      );
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const prepared = await supabase
      .from("sample_orders")
      .update({
        approval_status: "pending",
        approval_token_hash: tokenHash,
        approval_email_status: "pending",
        approval_error: null,
        approval_responded_at: null,
      })
      .eq("id", order.id);
    if (prepared.error) throw new Error(prepared.error.message);
    const origin = new URL(request.url).origin;
    try {
      await deliverPhysicalSampleApprovalEmail({
        to: order.approver_email,
        sequence: order.sequence,
        projectName: order.snapshot.project.name,
        canvasName: order.snapshot.canvas.name,
        supplierName: order.snapshot.supplier.name,
        trackingNumber: order.current_payload.trackingNumber,
        approvalUrl: `${origin}/api/sample-orders/approval?token=${token}&decision=approved`,
        rejectionUrl: `${origin}/api/sample-orders/approval?token=${token}&decision=rejected`,
      });
      await supabase
        .from("sample_orders")
        .update({
          approval_email_status: "sent",
          approval_sent_at: new Date().toISOString(),
          approval_error: null,
        })
        .eq("id", order.id);
      return NextResponse.json({ success: true });
    } catch (error) {
      await supabase
        .from("sample_orders")
        .update({
          approval_email_status: "failed",
          approval_error: error instanceof Error ? error.message : "Approval email failed",
        })
        .eq("id", order.id);
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval retry failed." },
      { status: 500 },
    );
  }
}
