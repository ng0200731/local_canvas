import "server-only";

import type { QueryResultRow } from "pg";
import { z } from "zod";

import { queryOne, withTransaction } from "@/lib/db/client";
import { isLocalPostgresConfigured, isSupabaseConfigured, localUserId } from "@/lib/env";
import { canvasContentSchema } from "@/lib/nodes/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const canvasSendDecisionSchema = z.enum(["approved", "rejected"]);

const canvasSendStatusSchema = z.enum(["awaiting_approval", "approved", "rejected"]);

export const canvasSendPublicRowSchema = z.object({
  sequence: z.string().regex(/^CA\d{6}$/),
  status: canvasSendStatusSchema,
  recipient_email: z.string(),
  report_snapshot: z.unknown(),
  created_at: z.string(),
  responded_at: z.string().nullable(),
  canvases: z
    .object({
      id: z.string().optional(),
      project_id: z.string().optional(),
      name: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      content: canvasContentSchema,
      projects: z
        .object({
          id: z.string().optional(),
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

export const canvasSendResponseSchema = z.object({
  sequence: z.string(),
  status: canvasSendDecisionSchema,
  alreadyResponded: z.boolean().optional(),
});

export type CanvasSendDecision = z.infer<typeof canvasSendDecisionSchema>;
export type CanvasSendPublicRow = z.infer<typeof canvasSendPublicRowSchema>;
export type CanvasSendResponse = z.infer<typeof canvasSendResponseSchema>;

type CanvasSendPublicDbRow = QueryResultRow & {
  sequence: string;
  status: string;
  recipient_email: string;
  report_snapshot: unknown;
  created_at: Date | string;
  responded_at: Date | string | null;
  canvas_id: string;
  project_id: string;
  canvas_name: string;
  canvas_created_at: Date | string;
  canvas_updated_at: Date | string;
  canvas_content: unknown;
  project_name: string | null;
  customer_name: string | null;
  employee_name: string | null;
  employee_title: string | null;
  employee_email: string | null;
  employee_tel: string | null;
};

type CanvasSendUpdateDbRow = QueryResultRow & {
  canvas_id: string;
  sequence: string;
  status: string;
  responded_at: Date | string | null;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPublicRow(row: CanvasSendPublicDbRow): CanvasSendPublicRow {
  return canvasSendPublicRowSchema.parse({
    sequence: row.sequence,
    status: row.status,
    recipient_email: row.recipient_email,
    report_snapshot: row.report_snapshot,
    created_at: toIso(row.created_at),
    responded_at: row.responded_at ? toIso(row.responded_at) : null,
    canvases: {
      id: row.canvas_id,
      project_id: row.project_id,
      name: row.canvas_name,
      created_at: toIso(row.canvas_created_at),
      updated_at: toIso(row.canvas_updated_at),
      content: row.canvas_content,
      projects: row.project_name
        ? {
            id: row.project_id,
            name: row.project_name,
            customer_name: row.customer_name,
            employee_name: row.employee_name,
            employee_title: row.employee_title,
            employee_email: row.employee_email,
            employee_tel: row.employee_tel,
          }
        : null,
    },
  });
}

export async function getLocalCanvasSendPublic(
  sequence: string,
  token: string,
): Promise<CanvasSendPublicRow | null> {
  const row = await queryOne<CanvasSendPublicDbRow>(
    `SELECT cs.sequence, cs.status, cs.recipient_email, cs.report_snapshot,
            cs.created_at, cs.responded_at,
            c.id AS canvas_id,
            c.project_id,
            c.name AS canvas_name,
            c.created_at AS canvas_created_at,
            c.updated_at AS canvas_updated_at,
            c.content AS canvas_content,
            p.name AS project_name,
            p.customer_name,
            p.employee_name,
            p.employee_title,
            p.employee_email,
            p.employee_tel
     FROM public.canvas_sends cs
     JOIN public.canvases c ON c.id = cs.canvas_id
     LEFT JOIN public.projects p ON p.id = c.project_id
     WHERE cs.sequence = $1
       AND cs.approval_token = $2
       AND cs.user_id = $3
     LIMIT 1`,
    [sequence, token, localUserId],
  );

  return row ? mapPublicRow(row) : null;
}

export async function getCanvasSendPublic(
  sequence: string,
  token: string,
): Promise<CanvasSendPublicRow | null> {
  if (isSupabaseConfigured) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_canvas_send_public", {
      p_sequence: sequence,
      p_token: token,
    });
    if (error || !data) return null;
    return canvasSendPublicRowSchema.parse(data);
  }

  if (isLocalPostgresConfigured) {
    return await getLocalCanvasSendPublic(sequence, token);
  }

  return null;
}

export async function respondLocalCanvasSend(
  token: string,
  status: CanvasSendDecision,
): Promise<CanvasSendResponse> {
  return await withTransaction(async (client) => {
    const current = await client.query<CanvasSendUpdateDbRow>(
      `SELECT canvas_id, sequence, status, responded_at
       FROM public.canvas_sends
       WHERE approval_token = $1
         AND user_id = $2
       FOR UPDATE`,
      [token, localUserId],
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error("Canvas send link was not found.");
    }

    const currentStatus = canvasSendStatusSchema.parse(row.status);
    if (currentStatus !== "awaiting_approval") {
      return canvasSendResponseSchema.parse({
        sequence: row.sequence,
        status: currentStatus,
        alreadyResponded: true,
      });
    }

    await client.query(
      `UPDATE public.canvas_sends
       SET status = $3,
           responded_at = now()
       WHERE approval_token = $1
         AND user_id = $2`,
      [token, localUserId, status],
    );

    await client.query(
      `UPDATE public.canvases
       SET status = $3,
           updated_at = now()
       WHERE id = $1
         AND user_id = $2`,
      [row.canvas_id, localUserId, status],
    );

    return canvasSendResponseSchema.parse({
      sequence: row.sequence,
      status,
      alreadyResponded: false,
    });
  });
}
