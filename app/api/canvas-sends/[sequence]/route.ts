import { NextResponse } from "next/server";
import { z } from "zod";

import { buildCanvasScanPayload } from "@/lib/canvas-scan";
import {
  getCanvasSendPublic,
  type CanvasSendPublicRow,
} from "@/lib/canvas-send-public";

export const runtime = "nodejs";

const sequenceSchema = z.string().regex(/^CA\d{6}$/);
const tokenSchema = z.string().min(32).max(200).regex(/^\S+$/);

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
};

type CanvasSendLookup = (
  sequence: string,
  token: string,
) => Promise<CanvasSendPublicRow | null>;

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return null;
  const parsed = tokenSchema.safeParse(match[1]);
  return parsed.success ? parsed.data : null;
}

function privateError(status: 404 | 500): NextResponse {
  return NextResponse.json(
    { error: status === 404 ? "Canvas report not found." : "Canvas report could not be loaded." },
    { status, headers: responseHeaders },
  );
}

export function createCanvasScanGetHandler(lookup: CanvasSendLookup = getCanvasSendPublic) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ sequence: string }> },
  ): Promise<NextResponse> {
    const { sequence: rawSequence } = await context.params;
    const sequence = sequenceSchema.safeParse(rawSequence);
    const token = bearerToken(request);
    if (!sequence.success || !token) return privateError(404);

    try {
      const row = await lookup(sequence.data, token);
      if (!row) return privateError(404);
      return NextResponse.json(buildCanvasScanPayload(row), { headers: responseHeaders });
    } catch (error) {
      console.error("Canvas scan lookup failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return privateError(500);
    }
  };
}

export const GET = createCanvasScanGetHandler();
