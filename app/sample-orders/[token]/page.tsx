import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { ArrowUpRight, Boxes, CalendarClock, Factory, PackageCheck } from "lucide-react";
import { z } from "zod";

import { SupplierUpdateForm } from "@/components/sample-status/supplier-update-form";
import { Badge } from "@/components/ui/badge";
import {
  sampleApprovalStatusSchema,
  sampleOrderSnapshotSchema,
  sampleStageSchema,
  sampleUpdatePayloadSchema,
  SAMPLE_STAGE_LABELS,
  payloadSummary,
} from "@/lib/sample-orders";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  sequence: z.string(),
  snapshot: sampleOrderSnapshotSchema,
  current_stage: sampleStageSchema.nullable(),
  current_payload: sampleUpdatePayloadSchema.nullable(),
  approval_status: sampleApprovalStatusSchema,
  purchase_sent_at: z.string().nullable(),
  sample_order_updates: z
    .array(
      z.object({
        id: z.string(),
        stage: sampleStageSchema,
        payload: sampleUpdatePayloadSchema,
        created_at: z.string(),
      }),
    )
    .default([]),
});

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not set";
}

export default async function SampleOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 32) notFound();
  let order: z.infer<typeof rowSchema>;
  try {
    const hash = createHash("sha256").update(token).digest("hex");
    const supabase = getSupabaseServiceClient();
    const result = await supabase
      .from("sample_orders")
      .select(
        "sequence, snapshot, current_stage, current_payload, approval_status, purchase_sent_at, sample_order_updates(id, stage, payload, created_at)",
      )
      .eq("supplier_token_hash", hash)
      .maybeSingle();
    if (result.error || !result.data) notFound();
    order = rowSchema.parse(result.data);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    notFound();
  }

  return (
    <main className="bg-muted/30 min-h-dvh px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="bg-background overflow-hidden rounded-2xl border shadow-sm">
          <div className="bg-primary text-primary-foreground border-b px-5 py-6 sm:px-8">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase opacity-75">
              Supplier sample order
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{order.sequence}</h1>
              <Badge variant="secondary">
                {order.current_stage
                  ? SAMPLE_STAGE_LABELS[order.current_stage]
                  : "Awaiting first update"}
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 p-5 text-sm sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Project</p>
              <p className="mt-1 font-medium">{order.snapshot.project.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Canvas</p>
              <p className="mt-1 font-medium">{order.snapshot.canvas.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Supplier</p>
              <p className="mt-1 font-medium">{order.snapshot.supplier.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Purchase sent</p>
              <p className="mt-1 font-medium">{formatDate(order.purchase_sent_at)}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid content-start gap-4">
            <article className="bg-background rounded-2xl border p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2">
                <Boxes className="text-primary size-5" />
                <h2 className="font-semibold">Purchase details</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {order.snapshot.lines.map((line) => (
                  <div key={line.nodeId} className="bg-muted/25 rounded-xl border p-4">
                    <p className="font-medium">{line.subject}</p>
                    <ul className="text-muted-foreground mt-2 grid gap-1 text-sm">
                      {line.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <a
                href={order.snapshot.canvas.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
              >
                Open approved canvas report <ArrowUpRight className="size-4" />
              </a>
            </article>
            <article className="bg-background rounded-2xl border p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2">
                <CalendarClock className="text-primary size-5" />
                <h2 className="font-semibold">Update history</h2>
              </div>
              {order.sample_order_updates.length ? (
                <ol className="mt-4 grid gap-3">
                  {[...order.sample_order_updates]
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map((update) => (
                      <li key={update.id} className="border-primary/30 border-l-2 pl-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{SAMPLE_STAGE_LABELS[update.stage]}</span>
                          <time className="text-muted-foreground text-xs">
                            {formatDate(update.created_at)}
                          </time>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {payloadSummary(update.payload)}
                        </p>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-muted-foreground mt-4 text-sm">No supplier updates yet.</p>
              )}
            </article>
          </div>
          <article className="bg-background rounded-2xl border p-5 shadow-sm sm:p-8">
            <div className="mb-6 flex items-start gap-3">
              <span className="bg-primary/10 text-primary rounded-xl p-2">
                <Factory className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">Update sample progress</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Choose any stage and enter the latest confirmed information.
                </p>
              </div>
            </div>
            <SupplierUpdateForm token={token} />
            {order.approval_status !== "not_requested" ? (
              <div className="bg-muted/30 mt-6 flex items-center gap-2 rounded-xl border p-4 text-sm">
                <PackageCheck className="text-primary size-5" />
                Physical sample approval:{" "}
                <strong>{order.approval_status.replaceAll("_", " ")}</strong>
              </div>
            ) : null}
          </article>
        </section>
      </div>
    </main>
  );
}
