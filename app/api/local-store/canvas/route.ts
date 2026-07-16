import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { isLocalPostgresConfigured, isSupabaseConfigured } from "@/lib/env";
import { createPostgresCanvasStore } from "@/lib/store/postgresCanvasStore";
import type { CanvasStore } from "@/lib/store/canvasStore";

const requestSchema = z.object({
  method: z.string().min(1),
  args: z.array(z.unknown()).default([]),
});

type CanvasMethod = {
  [K in keyof CanvasStore]: CanvasStore[K] extends (...args: never[]) => unknown ? K : never;
}[keyof CanvasStore];

const METHODS = new Set<string>([
  "listProjects",
  "getProject",
  "createProject",
  "updateProject",
  "deleteProject",
  "listCanvases",
  "getCanvas",
  "createCanvas",
  "renameCanvas",
  "saveCanvasContent",
  "updateCanvasStatus",
  "deleteCanvas",
  "listCanvasSends",
  "createCanvasSend",
  "updateCanvasSend",
  "listSampleOrders",
  "upsertSampleOrder",
  "updateSampleOrderEmail",
  "rotateSampleOrderToken",
  "generateDemoSampleOrders",
  "listImages",
  "recordImage",
]);

function assertLocalMode() {
  if (isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Local Postgres API is disabled while Supabase is configured." },
      { status: 409 },
    );
  }
  if (!isLocalPostgresConfigured) {
    return NextResponse.json(
      { error: "Local Postgres is not configured. Set NEXT_PUBLIC_LOCAL_POSTGRES=true and DATABASE_URL." },
      { status: 503 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = assertLocalMode();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { method, args } = parsed.data;
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: `Unknown method: ${method}` }, { status: 400 });
  }

  try {
    const store = createPostgresCanvasStore();
    const fn = store[method as CanvasMethod] as (...fnArgs: unknown[]) => Promise<unknown>;
    const result = await fn.apply(store, args);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local store request failed.";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
