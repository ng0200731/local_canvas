import { NextResponse } from "next/server";

import { supplierImageMatchRequestSchema } from "@/lib/supplier-image-match";
import { matchSupplierImagesWithPictureSherlock } from "@/lib/supplier-image-picture-sherlock";
import { type SupplierImageMatcher } from "@/lib/supplier-image-vector-match";

export const runtime = "nodejs";
export const maxDuration = 120;

interface SupplierImageMatchRouteDependencies {
  match: SupplierImageMatcher;
}

export function createSupplierImageMatchPostHandler({
  match,
}: SupplierImageMatchRouteDependencies) {
  return async function POST(request: Request) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const parsed = supplierImageMatchRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid supplier image search request." },
        { status: 400 },
      );
    }

    try {
      return NextResponse.json(await match(parsed.data, request.signal));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Supplier image search failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  };
}

export const POST = createSupplierImageMatchPostHandler({
  match: matchSupplierImagesWithPictureSherlock,
});
