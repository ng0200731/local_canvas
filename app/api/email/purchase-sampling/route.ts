import { authorizeEmailDelivery } from "@/lib/email/authorization";
import { deliverPurchaseSamplingEmail } from "@/lib/email/mailer";
import { createEmailPostHandler } from "@/lib/email/route-handler";
import { sendPurchaseSamplingEmailRequestSchema } from "@/lib/email/schemas";

export const runtime = "nodejs";

export const POST = createEmailPostHandler({
  requestSchema: sendPurchaseSamplingEmailRequestSchema,
  authorize: authorizeEmailDelivery,
  deliver: deliverPurchaseSamplingEmail,
});
