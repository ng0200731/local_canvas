import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { EmailConfigurationError, EmailDeliveryError } from "@/lib/email/mailer";
import { emailDeliveryResponseSchema } from "@/lib/email/schemas";

interface EmailPostHandlerOptions<Input> {
  requestSchema: ZodType<Input>;
  deliver: (input: Input) => Promise<unknown>;
  authorize?: () => Promise<boolean>;
}

export function createEmailPostHandler<Input>({
  requestSchema,
  deliver,
  authorize,
}: EmailPostHandlerOptions<Input>) {
  return async function POST(request: Request) {
    if (authorize && !(await authorize())) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid email request." },
        { status: 400 },
      );
    }

    try {
      const result = emailDeliveryResponseSchema.parse(await deliver(parsed.data));
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof EmailConfigurationError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      if (error instanceof EmailDeliveryError) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      return NextResponse.json(
        { error: "Email delivery failed. Check the server configuration and try again." },
        { status: 502 },
      );
    }
  };
}
