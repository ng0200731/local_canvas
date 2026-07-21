import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { EmailConfigurationError, EmailDeliveryError } from "@/lib/email/mailer";
import { emailDeliveryResponseSchema } from "@/lib/email/schemas";

interface EmailPostHandlerOptions<Input> {
  requestSchema: ZodType<Input>;
  deliver: (input: Input) => Promise<unknown>;
  authorize?: () => Promise<boolean>;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

function isEmailConfigurationError(error: unknown): error is EmailConfigurationError {
  return (
    error instanceof EmailConfigurationError || hasErrorCode(error, "EMAIL_CONFIGURATION_ERROR")
  );
}

function isEmailDeliveryError(error: unknown): error is EmailDeliveryError {
  return error instanceof EmailDeliveryError || hasErrorCode(error, "EMAIL_DELIVERY_ERROR");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Email delivery failed.";
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
      if (isEmailConfigurationError(error)) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 503 });
      }
      if (isEmailDeliveryError(error)) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 502 });
      }
      console.error("Email route failed before provider delivery completed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
      });
      return NextResponse.json(
        {
          error: `Email delivery failed: ${error instanceof Error ? error.message : "Check the server configuration and try again."}`,
        },
        { status: 502 },
      );
    }
  };
}
