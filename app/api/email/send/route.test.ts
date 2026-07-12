import { describe, expect, it, vi } from "vitest";

import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendCanvasEmailRequestSchema } from "@/lib/email/schemas";

function request(body: unknown): Request {
  return new Request("http://localhost/api/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  to: "recipient@example.com",
  canvasName: "Campaign board",
  images: [
    {
      id: "render-1",
      url: "https://images.example.com/render.webp",
      prompt: "Product image",
      createdAt: "2026-07-12T12:00:00.000Z",
    },
  ],
};

describe("POST /api/email/send", () => {
  it("validates the recipient and selected render images", async () => {
    const deliver = vi.fn();
    const handler = createEmailPostHandler({
      requestSchema: sendCanvasEmailRequestSchema,
      deliver,
    });

    expect((await handler(request({ ...validBody, to: "not-an-email" }))).status).toBe(400);
    expect(
      (
        await handler(
          request({
            ...validBody,
            images: [{ ...validBody.images[0], url: "file:///server/secret.png" }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("delivers a valid request and returns the validated provider result", async () => {
    const deliver = vi.fn().mockResolvedValue({
      success: true,
      provider: "163",
      messageId: "message-id",
    });
    const handler = createEmailPostHandler({
      requestSchema: sendCanvasEmailRequestSchema,
      deliver,
    });

    const response = await handler(request(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      provider: "163",
      messageId: "message-id",
    });
    expect(deliver).toHaveBeenCalledWith(validBody);
  });

  it("does not expose invalid transport responses", async () => {
    const handler = createEmailPostHandler({
      requestSchema: sendCanvasEmailRequestSchema,
      deliver: vi.fn().mockResolvedValue({ password: "must-not-leak" }),
    });

    const response = await handler(request(validBody));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Email delivery failed. Check the server configuration and try again.",
    });
  });
});
