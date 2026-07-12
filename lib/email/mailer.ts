import "server-only";

import nodemailer, { type SendMailOptions } from "nodemailer";
import { z } from "zod";

import { env } from "@/lib/env";
import { renderCanvasReportPdf } from "@/lib/email/pdf-report";
import {
  emailDeliveryResponseSchema,
  sendCanvasEmailRequestSchema,
  sendCanvasReportEmailRequestSchema,
  sendTestEmailRequestSchema,
  type EmailDeliveryResponse,
  type SendCanvasEmailRequest,
  type SendCanvasReportEmailRequest,
  type SendTestEmailRequest,
  type SmtpProviderId,
} from "@/lib/email/schemas";

export interface SmtpProviderConfig {
  id: SmtpProviderId;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  username: string;
  password: string;
  fromName: string;
}

export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

export type MailTransportFactory = (provider: SmtpProviderConfig) => MailTransport;

interface EmailDeliveryDependencies {
  providers: readonly SmtpProviderConfig[];
  createTransport: MailTransportFactory;
}

const smtpSendResultSchema = z
  .object({
    messageId: z.string().min(1),
    accepted: z.array(z.unknown()).min(1),
    rejected: z.array(z.unknown()).optional(),
    response: z.string().optional(),
  })
  .passthrough();

const dataImageSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  base64: z.string().min(1),
});

export class EmailConfigurationError extends Error {
  constructor() {
    super(
      "Email delivery is not configured. Add the server-side SMTP environment variables, then restart or redeploy the app.",
    );
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor(providerNames: readonly string[]) {
    super(
      `Email delivery failed using ${providerNames.join(" and ")}. Check the SMTP credentials in Settings > SMTP setting.`,
    );
    this.name = "EmailDeliveryError";
  }
}

function createNodemailerTransport(provider: SmtpProviderConfig): MailTransport {
  const transport = nodemailer.createTransport({
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    requireTLS: provider.requireTls,
    ...(provider.password
      ? {
          auth: {
            user: provider.username,
            pass: provider.password,
          },
        }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  return {
    async sendMail(options) {
      return (await transport.sendMail(options)) as unknown;
    },
  };
}

function configuredProviders(): SmtpProviderConfig[] {
  const fromName = env.SMTP_FROM_NAME ?? "Infinite Canvas";
  const providers: SmtpProviderConfig[] = [];

  if (env.SMTP_163_USERNAME && env.SMTP_163_PASSWORD) {
    providers.push({
      id: "163",
      name: "163.com",
      host: "smtp.163.com",
      port: 465,
      secure: true,
      requireTls: false,
      username: env.SMTP_163_USERNAME,
      password: env.SMTP_163_PASSWORD,
      fromName,
    });
  }
  if (env.SMTP_GMAIL_USERNAME && env.SMTP_GMAIL_PASSWORD) {
    providers.push({
      id: "gmail",
      name: "Gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTls: true,
      username: env.SMTP_GMAIL_USERNAME,
      password: env.SMTP_GMAIL_PASSWORD,
      fromName,
    });
  }
  return providers;
}

function configuredLocalProvider(): SmtpProviderConfig[] {
  if (!env.SMTP_LOCAL_HOST || !env.SMTP_LOCAL_PORT) return [];
  return [
    {
      id: "local",
      name: "Local SMTP",
      host: env.SMTP_LOCAL_HOST,
      port: env.SMTP_LOCAL_PORT,
      secure: env.SMTP_LOCAL_SECURE,
      requireTls: false,
      username: env.SMTP_LOCAL_USERNAME ?? "local@example.com",
      password: env.SMTP_LOCAL_PASSWORD ?? "",
      fromName: env.SMTP_FROM_NAME ?? "Infinite Canvas",
    },
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function withLineBreaks(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function parseDataImage(value: string): z.infer<typeof dataImageSchema> | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(value);
  if (!match) return null;
  const parsed = dataImageSchema.safeParse({ mimeType: match[1], base64: match[2] });
  return parsed.success ? parsed.data : null;
}

function extensionForMimeType(mimeType: z.infer<typeof dataImageSchema>["mimeType"]): string {
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType.slice("image/".length);
}

export interface PreparedMail {
  subject: string;
  text: string;
  html: string;
  attachments: NonNullable<SendMailOptions["attachments"]>;
}

export function prepareCanvasMail(input: SendCanvasEmailRequest): PreparedMail {
  const attachments: NonNullable<SendMailOptions["attachments"]> = [];
  const textImages: string[] = [];
  const htmlImages: string[] = [];

  input.images.forEach((image, index) => {
    const number = index + 1;
    const dataImage = parseDataImage(image.url);
    const prompt = image.prompt ? `Prompt: ${image.prompt}` : "Render image";

    if (dataImage) {
      const filename = `canvas-render-${String(number).padStart(2, "0")}.${extensionForMimeType(
        dataImage.mimeType,
      )}`;
      const cid = `canvas-render-${number}@infinite-canvas`;
      attachments.push({
        filename,
        content: Buffer.from(dataImage.base64, "base64"),
        contentType: dataImage.mimeType,
        cid,
      });
      textImages.push(`${number}. ${prompt} (attached as ${filename})`);
      htmlImages.push(
        `<li><p>${escapeHtml(prompt)}</p><img src="cid:${cid}" alt="Canvas render ${number}"></li>`,
      );
      return;
    }

    textImages.push(`${number}. ${prompt}: ${image.url}`);
    htmlImages.push(
      `<li><p>${escapeHtml(prompt)}</p><p><a href="${escapeHtml(image.url)}">Open full-size image</a></p><a href="${escapeHtml(image.url)}"><img src="${escapeHtml(image.url)}" alt="Canvas render ${number}"></a></li>`,
    );
  });

  const intro = input.message ?? `Here are the selected render images from ${input.canvasName}.`;
  return {
    subject: input.subject ?? `${input.canvasName} render images`,
    text: `${intro}\n\n${textImages.join("\n")}`,
    html: `<p>${withLineBreaks(intro)}</p><ol>${htmlImages.join("")}</ol>`,
    attachments,
  };
}

export function prepareTestMail(): PreparedMail {
  return {
    subject: "Infinite Canvas SMTP test",
    text: "Your Infinite Canvas SMTP configuration is working. You can now send canvas render images.",
    html: "<p>Your Infinite Canvas SMTP configuration is working.</p><p>You can now send canvas render images.</p>",
    attachments: [],
  };
}

export async function prepareCanvasReportMail(
  input: SendCanvasReportEmailRequest,
): Promise<PreparedMail> {
  const pdf = await renderCanvasReportPdf({
    title: input.subject,
    customerName: input.canvasName,
    text: input.text,
  });
  return {
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: [
      {
        filename: input.pdfFilename,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  };
}

export function createEmailDelivery({ providers, createTransport }: EmailDeliveryDependencies) {
  return async function deliver(to: string, mail: PreparedMail): Promise<EmailDeliveryResponse> {
    if (providers.length === 0) throw new EmailConfigurationError();

    for (const provider of providers) {
      try {
        const result = smtpSendResultSchema.parse(
          await createTransport(provider).sendMail({
            from: { name: provider.fromName, address: provider.username },
            to,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            attachments: mail.attachments,
          }),
        );
        return emailDeliveryResponseSchema.parse({
          success: true,
          provider: provider.id,
          messageId: result.messageId,
        });
      } catch {
        // Continue to the next configured provider. Credential and SMTP details
        // deliberately stay server-side and are never returned to the browser.
      }
    }

    throw new EmailDeliveryError(providers.map((provider) => provider.name));
  };
}

function delivery() {
  return createEmailDelivery({
    providers: [...configuredLocalProvider(), ...configuredProviders()],
    createTransport: createNodemailerTransport,
  });
}

export async function deliverCanvasEmail(input: SendCanvasEmailRequest) {
  const parsed = sendCanvasEmailRequestSchema.parse(input);
  return delivery()(parsed.to, prepareCanvasMail(parsed));
}

export async function deliverCanvasReportEmail(input: SendCanvasReportEmailRequest) {
  const parsed = sendCanvasReportEmailRequestSchema.parse(input);
  return delivery()(parsed.to, await prepareCanvasReportMail(parsed));
}

export async function deliverTestEmail(input: SendTestEmailRequest) {
  const parsed = sendTestEmailRequestSchema.parse(input);
  return delivery()(parsed.to, prepareTestMail());
}
