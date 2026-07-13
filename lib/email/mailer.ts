import "server-only";

import nodemailer, { type SendMailOptions } from "nodemailer";
import { z } from "zod";

import { env } from "@/lib/env";
import { renderCanvasReportPdf } from "@/lib/email/pdf-report";
import {
  emailDeliveryResponseSchema,
  sendCanvasEmailRequestSchema,
  sendCanvasReportEmailRequestSchema,
  sendPurchaseSamplingEmailRequestSchema,
  sendTestEmailRequestSchema,
  type EmailDeliveryResponse,
  type SendCanvasEmailRequest,
  type SendCanvasReportEmailRequest,
  type SendPurchaseSamplingEmailRequest,
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
  readonly code = "EMAIL_CONFIGURATION_ERROR";

  constructor() {
    super(
      "Email delivery is not configured. Add the server-side SMTP environment variables, then restart or redeploy the app.",
    );
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  readonly code = "EMAIL_DELIVERY_ERROR";

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

function sanitizeReportHtmlForEmail(html: string): string {
  return html.replace(
    /<img\b[^>]*?\bsrc=(["'])(data:image\/[^"']+)\1[^>]*>/gi,
    (match, _quote: string, src: string) =>
      src.length <= 50_000
        ? match
        : '<span class="email-image-note">Image included in the attached PDF.</span>',
  );
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

type CanvasReportPdfRenderer = typeof renderCanvasReportPdf;

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

export function preparePurchaseSamplingMail(input: SendPurchaseSamplingEmailRequest): PreparedMail {
  const subject = `${input.sequence} start sampling`;
  const text = [
    `Dear ${input.supplierName},`,
    "",
    `${input.sequence} start sampling.`,
    `Project: ${input.projectName}`,
    `Canvas: ${input.canvasName}`,
    "",
    "Please start sampling and reply with the sample schedule.",
  ].join("\n");
  const html = `<p>Dear ${escapeHtml(input.supplierName)},</p><p><strong>${escapeHtml(
    input.sequence,
  )} start sampling</strong></p><p>Project: ${escapeHtml(
    input.projectName,
  )}<br>Canvas: ${escapeHtml(
    input.canvasName,
  )}</p><p>Please start sampling and reply with the sample schedule.</p>`;
  return { subject, text, html, attachments: [] };
}

export function prepareCanvasReportHtmlOnlyMail(input: SendCanvasReportEmailRequest): PreparedMail {
  return {
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: [],
  };
}

export async function prepareCanvasReportMail(
  input: SendCanvasReportEmailRequest,
  renderPdf: CanvasReportPdfRenderer = renderCanvasReportPdf,
  options: { requirePdf?: boolean } = {},
): Promise<PreparedMail> {
  try {
    const pdf = await renderPdf({
      title: input.subject,
      customerName: input.canvasName,
      text: input.text,
      report: input.report,
    });
    const emailHtml = sanitizeReportHtmlForEmail(input.html);
    return {
      subject: input.subject,
      text: input.text,
      html: emailHtml,
      attachments: [
        {
          filename: input.pdfFilename,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    };
  } catch (error) {
    console.error("Canvas report PDF generation failed; sending email without attachment.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    if (options.requirePdf) throw error;
  }

  const fallbackNote =
    "PDF attachment could not be generated, so this report was sent as email content only.";
  return {
    subject: input.subject,
    text: `${input.text}\n\n${fallbackNote}`,
    html: `${sanitizeReportHtmlForEmail(input.html)}<p>${escapeHtml(fallbackNote)}</p>`,
    attachments: [],
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
        const response = emailDeliveryResponseSchema.parse({
          success: true,
          provider: provider.id,
          messageId: result.messageId,
        });
        console.info("Email delivery accepted by SMTP provider.", {
          provider: response.provider,
          messageId: response.messageId,
        });
        return response;
      } catch (error) {
        console.warn("SMTP provider failed; trying next configured provider.", {
          provider: provider.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
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
  return delivery()(
    parsed.to,
    await prepareCanvasReportMail(parsed, renderCanvasReportPdf, { requirePdf: true }),
  );
}

export async function deliverTestEmail(input: SendTestEmailRequest) {
  const parsed = sendTestEmailRequestSchema.parse(input);
  return delivery()(parsed.to, prepareTestMail());
}

export async function deliverPurchaseSamplingEmail(input: SendPurchaseSamplingEmailRequest) {
  const parsed = sendPurchaseSamplingEmailRequestSchema.parse(input);
  return delivery()(parsed.to, preparePurchaseSamplingMail(parsed));
}
