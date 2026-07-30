import { NextResponse } from "next/server";
import { z } from "zod";

import { query } from "@/lib/db/client";
import { isLocalPostgresConfigured, localUserId } from "@/lib/env";

const requestSchema = z
  .object({
    orderId: z.string().min(1),
  })
  .strict();

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isLocalPostgresConfigured) {
    return NextResponse.json(
      { error: "Ship-out is only supported with the local Postgres store." },
      { status: 503 },
    );
  }

  try {
    const found = await query<{ current_stage: string | null }>(
      `SELECT current_stage FROM public.sample_orders WHERE id = $1 AND user_id = $2`,
      [parsed.data.orderId, localUserId],
    );
    const row = found[0];
    if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (row.current_stage !== "invoice") {
      return NextResponse.json(
        { error: "Only completed orders (invoice) can be shipped out." },
        { status: 400 },
      );
    }
    await query(
      `UPDATE public.sample_orders
       SET current_stage = 'shipment',
           latest_update_at = now(),
           updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [parsed.data.orderId, localUserId],
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ship-out failed." },
      { status: 500 },
    );
  }
}
