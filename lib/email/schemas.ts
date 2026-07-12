import { z } from "zod";

export const SMTP_PROVIDER_IDS = ["local", "163", "gmail"] as const;
export const smtpProviderIdSchema = z.enum(SMTP_PROVIDER_IDS);
export type SmtpProviderId = z.infer<typeof smtpProviderIdSchema>;

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_INLINE_IMAGE_CHARACTERS = 4_000_000;

export const emailRecipientSchema = z.email("Enter a valid recipient email address.").max(254);

export const emailImageUrlSchema = z
  .string()
  .min(1)
  .max(MAX_INLINE_IMAGE_CHARACTERS)
  .refine((value) => {
    if (value.startsWith("data:")) return DATA_IMAGE_PATTERN.test(value);
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Each image must be an HTTP(S) URL or a base64 PNG, JPEG, WebP, or GIF data URL.");

export const canvasEmailImageSchema = z
  .object({
    id: z.string().trim().min(1).max(150),
    url: emailImageUrlSchema,
    prompt: z.string().trim().max(1_000).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const sendCanvasEmailRequestSchema = z
  .object({
    to: emailRecipientSchema,
    canvasName: z.string().trim().min(1).max(150),
    subject: z.string().trim().min(1).max(180).optional(),
    message: z.string().trim().max(2_000).optional(),
    images: z.array(canvasEmailImageSchema).min(1).max(12),
  })
  .strict()
  .superRefine((value, context) => {
    const inlineCharacters = value.images.reduce(
      (total, image) => total + (image.url.startsWith("data:") ? image.url.length : 0),
      0,
    );
    if (inlineCharacters <= MAX_INLINE_IMAGE_CHARACTERS) return;
    context.addIssue({
      code: "custom",
      path: ["images"],
      message:
        "The selected inline images are too large to email at once. Select fewer images and try again.",
    });
  });

export type SendCanvasEmailRequest = z.infer<typeof sendCanvasEmailRequestSchema>;

export const sendCanvasReportEmailRequestSchema = z
  .object({
    to: emailRecipientSchema,
    canvasName: z.string().trim().min(1).max(150),
    subject: z.string().trim().min(1).max(180),
    html: z.string().trim().min(1).max(250_000),
    text: z.string().trim().min(1).max(120_000),
    pdfFilename: z.string().trim().min(1).max(120),
  })
  .strict();

export type SendCanvasReportEmailRequest = z.infer<typeof sendCanvasReportEmailRequestSchema>;

export const sendTestEmailRequestSchema = z
  .object({
    to: emailRecipientSchema,
  })
  .strict();

export type SendTestEmailRequest = z.infer<typeof sendTestEmailRequestSchema>;

export const emailDeliveryResponseSchema = z
  .object({
    success: z.literal(true),
    provider: smtpProviderIdSchema,
    messageId: z.string().min(1),
  })
  .strict();

export type EmailDeliveryResponse = z.infer<typeof emailDeliveryResponseSchema>;

export const emailApiErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();
