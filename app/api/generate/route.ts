import { NextResponse } from "next/server";

import { isXiangsuConfigured } from "@/lib/env";
import { imageGenerationRequestSchema } from "@/lib/image-generation-models";
import {
  generateXiangsuImage,
  type XiangsuGenerateInput,
  type XiangsuGenerateOutput,
} from "@/lib/xiangsu";

export const runtime = "nodejs";

interface GenerateRouteDependencies {
  configured: boolean;
  generate: (input: XiangsuGenerateInput) => Promise<XiangsuGenerateOutput>;
}

export function createGeneratePostHandler({ configured, generate }: GenerateRouteDependencies) {
  return async function POST(request: Request) {
    if (!configured) {
      return NextResponse.json(
        { error: "AI generation is disabled. Set XIANGSU_API_KEY in .env.local." },
        { status: 503 },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const parsed = imageGenerationRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      );
    }

    try {
      return NextResponse.json(await generate(parsed.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  };
}

export const POST = createGeneratePostHandler({
  configured: isXiangsuConfigured,
  generate: generateXiangsuImage,
});
