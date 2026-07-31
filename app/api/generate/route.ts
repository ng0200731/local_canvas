import { NextResponse } from "next/server";

import { isXiangsuConfigured, isOpenAiConfigured } from "@/lib/env";
import { imageGenerationRequestSchema } from "@/lib/image-generation-models";
import {
  generateXiangsuImage,
  type XiangsuGenerateInput,
  type XiangsuGenerateOutput,
} from "@/lib/xiangsu";
import { writeGenerateLog } from "@/lib/generate-log-store";

export const runtime = "nodejs";

interface GenerateRouteDependencies {
  configured: boolean;
  generate: (input: XiangsuGenerateInput, signal?: AbortSignal) => Promise<XiangsuGenerateOutput>;
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
      const startedAt = Date.now();
      const result = await generate(parsed.data, request.signal);
      writeGenerateLog({
        ok: true,
        request: parsed.data,
        compiledPrompt: result.diagnostics?.compiledPrompt,
        resolvedReferences: result.diagnostics?.resolvedReferences,
        formFields: result.diagnostics?.formFields,
        response: { url: result.url, model: result.model },
        durationMs: Date.now() - startedAt,
      });
      // Strip diagnostics from the client response — they're for the log only.
      const { diagnostics: _omit, ...clientResult } = result;
      return NextResponse.json(clientResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      writeGenerateLog({
        ok: false,
        request: parsed.data,
        error: message,
      });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  };
}

export const POST = createGeneratePostHandler({
  configured: isXiangsuConfigured || isOpenAiConfigured,
  generate: (input, signal) =>
    generateXiangsuImage(
      {
        model: input.model,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        size: input.size,
        outputFormat: input.outputFormat,
        resolution: input.resolution,
        references: input.references,
        matchSourceSize: input.matchSourceSize,
      },
      signal,
    ),
});
