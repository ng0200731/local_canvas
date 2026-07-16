import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  env,
  isLocalPostgresConfigured,
  isSupabaseConfigured,
  localUserId,
} from "@/lib/env";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function assertLocalMode() {
  if (isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Local uploads are disabled while Supabase is configured." },
      { status: 409 },
    );
  }
  if (!isLocalPostgresConfigured) {
    return NextResponse.json(
      {
        error:
          "Local Postgres is not configured. Set NEXT_PUBLIC_LOCAL_POSTGRES=true and DATABASE_URL.",
      },
      { status: 503 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const blocked = assertLocalMode();
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is empty or exceeds 12MB." }, { status: 400 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported image type: ${file.type}` }, { status: 400 });
  }

  const extensionFromName = path.extname(file.name).replace(".", "").toLowerCase();
  const extension =
    extensionFromName ||
    (file.type.includes("png")
      ? "png"
      : file.type.includes("webp")
        ? "webp"
        : file.type.includes("gif")
          ? "gif"
          : "jpg");

  const storagePath = `${localUserId}/${randomUUID()}.${extension}`;
  const absolutePath = path.join(process.cwd(), ".data", "uploads", storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  const baseUrl = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${baseUrl}/api/uploads/${storagePath.split("/").map(encodeURIComponent).join("/")}`;

  return NextResponse.json({ url, storagePath });
}
