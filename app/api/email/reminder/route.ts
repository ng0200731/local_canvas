import { authorizeEmailDelivery } from "@/lib/email/authorization";
import { deliverReminderEmail } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendReminderEmailRequestSchema } from "@/lib/email/schemas";

export const runtime = "nodejs";

export const POST = createEmailPostHandler({
  requestSchema: sendReminderEmailRequestSchema,
  authorize: authorizeEmailDelivery,
  deliver: deliverReminderEmail,
});
