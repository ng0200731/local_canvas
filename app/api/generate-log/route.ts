import { NextResponse } from "next/server";

import { clearGenerateLog, readGenerateLog } from "@/lib/generate-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ entries: readGenerateLog() });
}

export function DELETE() {
  clearGenerateLog();
  return NextResponse.json({ ok: true });
}
