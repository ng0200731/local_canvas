import "server-only";

import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { isLocalPostgresConfigured, isSupabaseConfigured, localUserId } from "@/lib/env";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function assertLocalMode() {
  if (isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Local uploads are disabled while Supabase is configured." },
      { status: 409 },
    );
  }
  if (!isLocalPostgresConfigured) {
    return NextResponse.json({ error: "Local Postgres is not configured." }, { status: 503 });
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const blocked = assertLocalMode();
  if (blocked) return blocked;

  const { path: segments } = await context.params;
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Only serve files under the fixed local user folder.
  if (segments[0] !== localUserId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Prevent path traversal.
  if (segments.some((segment) => segment === ".." || segment.includes("\\") || segment === "")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const relative = segments.join("/");
  const absolute = path.resolve(process.cwd(), ".data", "uploads", relative);
  const root = path.resolve(process.cwd(), ".data", "uploads", localUserId);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  if (!existsSync(absolute)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const stats = statSync(absolute);
  if (!stats.isFile()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const extension = path.extname(absolute).slice(1).toLowerCase();
  const contentType = MIME[extension] ?? "application/octet-stream";
  const stream = createReadStream(absolute);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stats.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
