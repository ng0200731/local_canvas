import { authorizeEmailDelivery } from "@/lib/email/authorization";
import { deliverTestEmail } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendTestEmailRequestSchema } from "@/lib/email/schemas";

export const runtime = "nodejs";

export const POST = createEmailPostHandler({
  requestSchema: sendTestEmailRequestSchema,
  deliver: deliverTestEmail,
  authorize: authorizeEmailDelivery,
});
