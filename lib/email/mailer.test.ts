import type { SendMailOptions } from "nodemailer";
import { describe, expect, it, vi } from "vitest";

import {
  createEmailDelivery,
  prepareCanvasMail,
  type MailTransportFactory,
  type SmtpProviderConfig,
} from "@/lib/email/mailer";

const primary: SmtpProviderConfig = {
  id: "163",
  name: "163.com",
  host: "smtp.163.com",
  port: 465,
  secure: true,
  requireTls: false,
  username: "sender@163.com",
  password: "authorization-password",
  fromName: "Infinite Canvas",
};

const backup: SmtpProviderConfig = {
  id: "gmail",
  name: "Gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTls: true,
  username: "sender@gmail.com",
  password: "app-password",
  fromName: "Infinite Canvas",
};

const mail = {
  subject: "Test subject",
  text: "Test text",
  html: "<p>Test</p>",
  attachments: [],
};

describe("SMTP email delivery", () => {
  it("sends with the primary provider and validates the SMTP response", async () => {
    const sent: SendMailOptions[] = [];
    const sendMail = vi.fn(async (options: SendMailOptions): Promise<unknown> => {
      sent.push(options);
      return {
        messageId: "primary-message-id",
        accepted: ["recipient@example.com"],
        rejected: [],
        response: "250 Message accepted",
      };
    });
    const createTransport: MailTransportFactory = () => ({ sendMail });
    const deliver = createEmailDelivery({ providers: [primary, backup], createTransport });

    await expect(deliver("recipient@example.com", mail)).resolves.toEqual({
      success: true,
      provider: "163",
      messageId: "primary-message-id",
    });
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sent[0]).toMatchObject({
      from: { name: "Infinite Canvas", address: "sender@163.com" },
      to: "recipient@example.com",
      subject: "Test subject",
    });
  });

  it("falls back to Gmail when 163.com rejects the send", async () => {
    const attempted: string[] = [];
    const createTransport: MailTransportFactory = (provider) => ({
      async sendMail(): Promise<unknown> {
        attempted.push(provider.id);
        if (provider.id === "163") throw new Error("Authentication failed");
        return {
          messageId: "backup-message-id",
          accepted: ["recipient@example.com"],
          rejected: [],
          response: "250 Message accepted",
        };
      },
    });
    const deliver = createEmailDelivery({ providers: [primary, backup], createTransport });

    await expect(deliver("recipient@example.com", mail)).resolves.toEqual({
      success: true,
      provider: "gmail",
      messageId: "backup-message-id",
    });
    expect(attempted).toEqual(["163", "gmail"]);
  });

  it("treats an invalid SMTP response as a failed provider", async () => {
    const createTransport: MailTransportFactory = () => ({
      async sendMail(): Promise<unknown> {
        return { messageId: "not-accepted", accepted: [] };
      },
    });
    const deliver = createEmailDelivery({ providers: [primary], createTransport });

    await expect(deliver("recipient@example.com", mail)).rejects.toThrow(
      "Email delivery failed using 163.com",
    );
  });

  it("attaches inline images and links hosted images without fetching them", () => {
    const prepared = prepareCanvasMail({
      to: "recipient@example.com",
      canvasName: "Campaign board",
      images: [
        {
          id: "inline",
          url: "data:image/png;base64,aW1hZ2U=",
          prompt: "Studio product photo",
          createdAt: "2026-07-12T12:00:00.000Z",
        },
        {
          id: "hosted",
          url: "https://images.example.com/render.webp",
          prompt: null,
          createdAt: "2026-07-12T12:01:00.000Z",
        },
      ],
    });

    expect(prepared.attachments).toHaveLength(1);
    expect(prepared.attachments[0]).toMatchObject({
      filename: "canvas-render-01.png",
      contentType: "image/png",
      cid: "canvas-render-1@infinite-canvas",
    });
    expect(prepared.html).toContain('src="cid:canvas-render-1@infinite-canvas"');
    expect(prepared.html).toContain("https://images.example.com/render.webp");
    expect(prepared.text).toContain("attached as canvas-render-01.png");
  });
});
