import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { canvasReportPayloadSchema } from "@/lib/email/schemas";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const sendRowSchema = z.object({
  sequence: z.string(),
  status: z.enum(["awaiting_approval", "approved", "rejected"]),
  recipient_email: z.string(),
  report_snapshot: z.unknown(),
  created_at: z.string(),
  responded_at: z.string().nullable(),
  canvases: z
    .object({
      name: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      content: z.unknown(),
      projects: z
        .object({
          name: z.string(),
          customer_name: z.string().nullable(),
          employee_name: z.string().nullable(),
          employee_title: z.string().nullable(),
          employee_email: z.string().nullable(),
          employee_tel: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
});

function formatDateTime(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function valueOrFallback(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Not set";
}

export default async function CanvasSendPage({
  params,
  searchParams,
}: {
  params: Promise<{ sequence: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { sequence } = await params;
  const { token } = await searchParams;
  if (!token) notFound();

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_canvas_send_public", {
    p_sequence: sequence,
    p_token: token,
  });
  if (error || !data) notFound();

  const row = sendRowSchema.parse(data);
  const report = canvasReportPayloadSchema.safeParse(row.report_snapshot);
  const project = row.canvases?.projects;
  const nodes = z
    .object({ nodes: z.array(z.object({ id: z.string(), type: z.string(), data: z.unknown() })) })
    .passthrough()
    .safeParse(row.canvases?.content);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Canvas send
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{row.sequence}</h1>
        </div>
        <Badge variant={row.status === "approved" ? "default" : "secondary"}>{row.status}</Badge>
      </div>

      <section className="grid gap-4 rounded-lg border p-4">
        <h2 className="text-base font-semibold">Canvas details</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Canvas</dt>
            <dd>{valueOrFallback(row.canvases?.name)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd>{valueOrFallback(project?.name)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDateTime(row.canvases?.created_at ?? null)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{formatDateTime(row.canvases?.updated_at ?? null)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Company</dt>
            <dd>{valueOrFallback(project?.customer_name)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employee</dt>
            <dd>
              {valueOrFallback(
                [project?.employee_name, project?.employee_title].filter(Boolean).join(" / "),
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employee email</dt>
            <dd>{valueOrFallback(project?.employee_email)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employee tel</dt>
            <dd>{valueOrFallback(project?.employee_tel)}</dd>
          </div>
        </dl>
      </section>

      {report.success && report.data.steps.length > 0 ? (
        <section className="mt-5 grid gap-4 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Canvas image and report</h2>
          {report.data.sections.map((section) => (
            <div key={section.id} className="grid gap-3">
              <h3 className="text-sm font-medium">{section.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.blocks.map((block) => (
                  <article key={block.id} className="rounded-md border p-3">
                    <p className="font-medium">{block.title}</p>
                    {block.image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={block.image.url}
                        alt={block.image.alt}
                        className="bg-muted mt-2 aspect-video w-full rounded object-contain"
                      />
                    ) : null}
                    <dl className="mt-2 grid gap-1 text-xs">
                      {block.details.map((detail) => (
                        <div key={`${block.id}-${detail.label}`} className="grid grid-cols-3 gap-2">
                          <dt className="text-muted-foreground">{detail.label}</dt>
                          <dd className="col-span-2 break-words">{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-5 grid gap-4 rounded-lg border p-4">
        <h2 className="text-base font-semibold">All nodes</h2>
        {nodes.success && nodes.data.nodes.length ? (
          <div className="grid gap-2">
            {nodes.data.nodes.map((node) => (
              <div key={node.id} className="rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{node.type}</span>
                <span className="text-muted-foreground ml-2">{node.id}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No nodes found.</p>
        )}
      </section>

      {report.success ? (
        <section className="mt-5 grid gap-4 rounded-lg border p-4">
          <h2 className="text-base font-semibold">All log</h2>
          <ol className="grid gap-2 text-sm">
            {report.data.steps.map((step) => (
              <li key={step.id} className="rounded-md border px-3 py-2">
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground mt-1">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
