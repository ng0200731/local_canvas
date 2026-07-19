import { z } from "zod";

import type { CanvasSendPublicRow } from "@/lib/canvas-send-public";
import { canvasReportPayloadSchema, type CanvasReportPayload } from "@/lib/email/schemas";

const nullableText = z.string().nullable();

const scanImageSchema = z
  .object({
    url: z.url().nullable(),
    alt: z.string(),
  })
  .strict();

const scanTableSchema = z
  .object({
    columns: z.array(z.string()),
    rows: z.array(
      z
        .object({
          label: z.string(),
          image: scanImageSchema.nullable(),
          values: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

const scanBlockSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    details: z.array(z.object({ label: z.string(), value: z.string() }).strict()),
    table: scanTableSchema.nullable(),
    image: scanImageSchema.nullable(),
  })
  .strict();

const scanReportSchema = z
  .object({
    title: z.string(),
    generatedAt: z.string(),
    sections: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          blocks: z.array(scanBlockSchema),
        })
        .strict(),
    ),
    steps: z.array(
      z.object({ id: z.string(), title: z.string(), detail: z.string() }).strict(),
    ),
  })
  .strict();

export const canvasScanPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    reference: z.string().regex(/^CA\d{6}$/),
    status: z.enum(["awaiting_approval", "approved", "rejected"]),
    createdAt: z.string(),
    respondedAt: z.string().nullable(),
    project: z
      .object({
        id: z.string().nullable(),
        name: z.string(),
        customerName: nullableText,
        employeeName: nullableText,
        employeeTitle: nullableText,
        employeeEmail: nullableText,
        employeeTel: nullableText,
        currency: nullableText,
        destination: nullableText,
      })
      .strict(),
    canvas: z
      .object({
        id: z.string().nullable(),
        projectId: z.string().nullable(),
        name: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
        nodeCount: z.number().int().nonnegative(),
        edgeCount: z.number().int().nonnegative(),
        nodes: z.array(
          z.object({ id: z.string(), type: z.string(), label: z.string().nullable() }).strict(),
        ),
        edges: z.array(
          z.object({ id: z.string(), source: z.string(), target: z.string() }).strict(),
        ),
      })
      .strict(),
    report: scanReportSchema.nullable(),
  })
  .strict();

export type CanvasScanPayload = z.infer<typeof canvasScanPayloadSchema>;

function meaningful(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.toLocaleLowerCase() !== "not set" ? normalized : null;
}

function safeImageUrl(value: string | null): string | null {
  if (!value || value.startsWith("data:")) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function nodeLabel(data: Record<string, unknown>): string | null {
  for (const key of ["alias", "title", "name", "subject", "code", "prompt"]) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const normalized = value.trim();
    return normalized.length <= 200 ? normalized : `${normalized.slice(0, 197)}...`;
  }
  return null;
}

function sanitizeImage(
  image: { url: string | null; alt: string } | null | undefined,
): z.infer<typeof scanImageSchema> | null {
  if (!image) return null;
  return { url: safeImageUrl(image.url), alt: image.alt };
}

function sanitizeReport(report: CanvasReportPayload): z.infer<typeof scanReportSchema> {
  return scanReportSchema.parse({
    title: report.title,
    generatedAt: report.generatedAt,
    sections: report.sections.map((section) => ({
      id: section.id,
      title: section.title,
      blocks: section.blocks.map((block) => ({
        id: block.id,
        title: block.title,
        subtitle: block.subtitle ?? null,
        details: block.details,
        table: block.table
          ? {
              columns: block.table.columns,
              rows: block.table.rows.map((row) => ({
                label: row.label,
                image: sanitizeImage(row.image),
                values: row.values,
              })),
            }
          : null,
        image: sanitizeImage(block.image),
      })),
    })),
    steps: report.steps,
  });
}

export function buildCanvasScanPayload(row: CanvasSendPublicRow): CanvasScanPayload {
  const reportResult = canvasReportPayloadSchema.safeParse(row.report_snapshot);
  const report = reportResult.success ? reportResult.data : null;
  const liveCanvas = row.canvases;
  const liveProject = liveCanvas?.projects;
  const content = liveCanvas?.content ?? { nodes: [], edges: [] };

  return canvasScanPayloadSchema.parse({
    schemaVersion: 1,
    reference: row.sequence,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    project: {
      id: liveProject?.id ?? liveCanvas?.project_id ?? null,
      name: report?.project.name ?? liveProject?.name ?? "Project",
      customerName: meaningful(report?.project.customerName ?? liveProject?.customer_name),
      employeeName: meaningful(report?.project.employeeName ?? liveProject?.employee_name),
      employeeTitle: meaningful(report?.project.employeeTitle ?? liveProject?.employee_title),
      employeeEmail: meaningful(report?.project.employeeEmail ?? liveProject?.employee_email),
      employeeTel: meaningful(report?.project.employeeTel ?? liveProject?.employee_tel),
      currency: meaningful(report?.project.currency),
      destination: meaningful(report?.project.destination),
    },
    canvas: {
      id: liveCanvas?.id ?? null,
      projectId: liveCanvas?.project_id ?? liveProject?.id ?? null,
      name: report?.canvas?.name ?? liveCanvas?.name ?? "Canvas",
      createdAt: report?.canvas?.createdAt ?? liveCanvas?.created_at ?? row.created_at,
      updatedAt: report?.canvas?.updatedAt ?? liveCanvas?.updated_at ?? row.created_at,
      nodeCount: content.nodes.length,
      edgeCount: content.edges.length,
      nodes: content.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: nodeLabel(node.data),
      })),
      edges: content.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    },
    report: report ? sanitizeReport(report) : null,
  });
}
