import { describe, expect, it, vi } from "vitest";

import { EmailConfigurationError } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendTestEmailRequestSchema } from "@/lib/email/schemas";

function request(body: unknown): Request {
  return new Request("http://localhost/api/email/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/email/test", () => {
  it("rejects an unauthenticated request before delivery", async () => {
    const deliver = vi.fn();
    const handler = createEmailPostHandler({
      requestSchema: sendTestEmailRequestSchema,
      deliver,
      authorize: vi.fn().mockResolvedValue(false),
    });

    const response = await handler(request({ to: "recipient@example.com" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication is required." });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("reports missing server configuration without exposing credentials", async () => {
    const handler = createEmailPostHandler({
      requestSchema: sendTestEmailRequestSchema,
      deliver: vi.fn().mockRejectedValue(new EmailConfigurationError()),
    });

    const response = await handler(request({ to: "recipient@example.com" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        "Email delivery is not configured. Add the server-side SMTP environment variables, then restart or redeploy the app.",
    });
  });
});
