import { authorizeEmailDelivery } from "@/lib/email/authorization";
import { deliverCanvasEmail } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendCanvasEmailRequestSchema } from "@/lib/email/schemas";

export const runtime = "nodejs";

export const POST = createEmailPostHandler({
  requestSchema: sendCanvasEmailRequestSchema,
  deliver: deliverCanvasEmail,
  authorize: authorizeEmailDelivery,
});
