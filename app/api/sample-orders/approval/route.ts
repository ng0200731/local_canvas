import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const decisionSchema = z.enum(["approved", "rejected"]);
const rowSchema = z.object({ id: z.string(), sequence: z.string(), approval_status: z.string() });

function page(sequence: string, status: string, alreadyResponded: boolean): string {
  const title = status === "approved" ? "Physical sample approved" : "Physical sample rejected";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;background:#f8fafc;margin:0;padding:32px"><main style="max-width:560px;margin:12vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px"><p style="color:#64748b;font-size:12px;text-transform:uppercase">${sequence}</p><h1>${title}</h1><p>${alreadyResponded ? "This link was already used; the recorded decision is shown above." : "Your decision has been recorded in Sample Status."}</p></main></body></html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const decision = decisionSchema.safeParse(url.searchParams.get("decision"));
  if (token.length < 32 || !decision.success)
    return NextResponse.json({ error: "Invalid approval link." }, { status: 400 });
  try {
    const supabase = getSupabaseServiceClient();
    const hash = createHash("sha256").update(token).digest("hex");
    const found = await supabase
      .from("sample_orders")
      .select("id, sequence, approval_status")
      .eq("approval_token_hash", hash)
      .maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data)
      return NextResponse.json({ error: "Approval link not found." }, { status: 404 });
    const order = rowSchema.parse(found.data);
    const alreadyResponded = order.approval_status !== "pending";
    const status = alreadyResponded ? order.approval_status : decision.data;
    if (!alreadyResponded) {
      const result = await supabase
        .from("sample_orders")
        .update({ approval_status: status, approval_responded_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("approval_status", "pending");
      if (result.error) throw new Error(result.error.message);
    }
    return new NextResponse(page(order.sequence, status, alreadyResponded), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed." },
      { status: 500 },
    );
  }
}
