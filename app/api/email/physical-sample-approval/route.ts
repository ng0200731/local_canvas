import { authorizeEmailDelivery } from "@/lib/email/authorization";
import { deliverPhysicalSampleApprovalEmail } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendPhysicalSampleApprovalEmailRequestSchema } from "@/lib/email/schemas";

export const runtime = "nodejs";

export const POST = createEmailPostHandler({
  requestSchema: sendPhysicalSampleApprovalEmailRequestSchema,
  authorize: authorizeEmailDelivery,
  deliver: deliverPhysicalSampleApprovalEmail,
});
