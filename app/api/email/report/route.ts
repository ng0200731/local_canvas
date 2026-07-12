import { authorizeEmailDelivery } from "@/lib/email/authorization";
import { deliverCanvasReportEmail } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendCanvasReportEmailRequestSchema } from "@/lib/email/schemas";

export const POST = createEmailPostHandler({
  requestSchema: sendCanvasReportEmailRequestSchema,
  authorize: authorizeEmailDelivery,
  deliver: deliverCanvasReportEmail,
});
