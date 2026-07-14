import {
  emailApiErrorSchema,
  emailDeliveryResponseSchema,
  sendCanvasEmailRequestSchema,
  sendCanvasReportEmailRequestSchema,
  sendPurchaseSamplingEmailRequestSchema,
  sendPhysicalSampleApprovalEmailRequestSchema,
  sendTestEmailRequestSchema,
  type EmailDeliveryResponse,
  type SendCanvasEmailRequest,
  type SendCanvasReportEmailRequest,
  type SendPurchaseSamplingEmailRequest,
  type SendPhysicalSampleApprovalEmailRequest,
  type SendTestEmailRequest,
} from "@/lib/email/schemas";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postEmailRequest(path: string, input: unknown): Promise<EmailDeliveryResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readJson(response);

  if (!response.ok) {
    const parsedError = emailApiErrorSchema.safeParse(json);
    throw new Error(parsedError.success ? parsedError.data.error : "Email delivery failed.");
  }

  const parsedResponse = emailDeliveryResponseSchema.safeParse(json);
  if (!parsedResponse.success) {
    throw new Error("The email server returned an invalid response.");
  }
  return parsedResponse.data;
}

export function sendCanvasEmail(input: SendCanvasEmailRequest): Promise<EmailDeliveryResponse> {
  return postEmailRequest("/api/email/send", sendCanvasEmailRequestSchema.parse(input));
}

export function sendCanvasReportEmail(
  input: SendCanvasReportEmailRequest,
): Promise<EmailDeliveryResponse> {
  return postEmailRequest("/api/email/report", sendCanvasReportEmailRequestSchema.parse(input));
}

export function sendTestEmail(input: SendTestEmailRequest): Promise<EmailDeliveryResponse> {
  return postEmailRequest("/api/email/test", sendTestEmailRequestSchema.parse(input));
}

export function sendPurchaseSamplingEmail(
  input: SendPurchaseSamplingEmailRequest,
): Promise<EmailDeliveryResponse> {
  return postEmailRequest(
    "/api/email/purchase-sampling",
    sendPurchaseSamplingEmailRequestSchema.parse(input),
  );
}

export function sendPhysicalSampleApprovalEmail(
  input: SendPhysicalSampleApprovalEmailRequest,
): Promise<EmailDeliveryResponse> {
  return postEmailRequest(
    "/api/email/physical-sample-approval",
    sendPhysicalSampleApprovalEmailRequestSchema.parse(input),
  );
}
