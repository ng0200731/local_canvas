import { z } from "zod";

const canvasSendSequenceSchema = z
  .string()
  .trim()
  .regex(/^CA\d{6}$/, "Canvas report reference must use the CA000000 format.");

const canvasSendTokenSchema = z.string().trim().min(32).max(200);

const publicBaseUrlSchema = z
  .url()
  .transform((value) => new URL(value))
  .superRefine((url, context) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({ code: "custom", message: "The public app URL must use HTTP or HTTPS." });
    }
    if (url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: "custom",
        message: "The public app URL cannot contain credentials, a query, or a fragment.",
      });
    }
  });

export interface CanvasSendLinks {
  reportUrl: string;
  approvalUrl: string;
  rejectionUrl: string;
}

export function normalizePublicAppUrl(
  configuredUrl: string | undefined,
  requestOrigin: string,
): string {
  const parsed = publicBaseUrlSchema.parse(configuredUrl?.trim() || requestOrigin);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

export function buildCanvasSendLinks(input: {
  baseUrl: string;
  sequence: string;
  token: string;
}): CanvasSendLinks {
  const baseUrl = publicBaseUrlSchema.parse(input.baseUrl);
  const sequence = canvasSendSequenceSchema.parse(input.sequence);
  const token = canvasSendTokenSchema.parse(input.token);

  const reportUrl = new URL(`/canvas-sends/${sequence}`, baseUrl);
  reportUrl.searchParams.set("token", token);

  const approvalUrl = new URL("/api/canvas-sends/respond", baseUrl);
  approvalUrl.searchParams.set("token", token);
  approvalUrl.searchParams.set("decision", "approved");

  const rejectionUrl = new URL("/api/canvas-sends/respond", baseUrl);
  rejectionUrl.searchParams.set("token", token);
  rejectionUrl.searchParams.set("decision", "rejected");

  return {
    reportUrl: reportUrl.toString(),
    approvalUrl: approvalUrl.toString(),
    rejectionUrl: rejectionUrl.toString(),
  };
}

export function createCanvasSendToken(): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure random token generation is unavailable in this browser.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
