"use client";

import { toDataURL } from "qrcode";

import { appendSupplierParam, type CanvasPurchaseTarget } from "@/lib/canvas-purchase";
import { primaryEmailRecipient } from "@/lib/email/addresses";
import { sendPurchaseSamplingEmail } from "@/lib/email/client";
import { createPublicToken, sha256Token } from "@/lib/sample-orders";
import { getCanvasStore, type Canvas, type CanvasSendRecord, type Project } from "@/lib/store";

export interface SendSamplePurchasesInput {
  canvas: Canvas;
  project: Pick<Project, "id" | "name" | "customerName">;
  approvedSend: CanvasSendRecord;
  targets: readonly CanvasPurchaseTarget[];
  origin: string;
}

export interface SendSamplePurchasesSummary {
  sentCount: number;
  failedEmailCount: number;
  failedStatusCount: number;
  firstError: string | null;
}

function employeeSnapshots(target: CanvasPurchaseTarget) {
  return target.supplier.employees.map((employee) => ({
    name: employee.userName,
    title: employee.title,
    email: `${employee.emailPrefix}@${target.supplier.company.emailDomainSuffix}`,
    tel: employee.tel,
  }));
}

export async function sendSamplePurchases({
  canvas,
  project,
  approvedSend,
  targets,
  origin,
}: SendSamplePurchasesInput): Promise<SendSamplePurchasesSummary> {
  const purchaseDate = new Date().toLocaleString();
  const approverEmail = primaryEmailRecipient(approvedSend.recipientEmail);
  if (!approverEmail) {
    return {
      sentCount: 0,
      failedEmailCount: 0,
      failedStatusCount: targets.length,
      firstError: "The approved canvas send does not have a valid approver email.",
    };
  }
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const reportUrl = appendSupplierParam(approvedSend.reportUrl, target.supplier.id);
      const supplierToken = createPublicToken();
      const supplierTokenHash = await sha256Token(supplierToken);
      const updateUrl = `${origin}/sample-orders/${supplierToken}`;
      const qrCodeDataUrl = await toDataURL(updateUrl, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: "M",
      });

      let orderId: string;
      try {
        const order = await getCanvasStore().upsertSampleOrder({
          canvasSendId: approvedSend.id,
          canvasId: canvas.id,
          projectId: project.id,
          supplierId: target.supplier.id,
          sequence: approvedSend.sequence,
          recipientEmail: target.email,
          approverEmail,
          supplierTokenHash,
          snapshot: {
            project: {
              id: project.id,
              name: project.name,
              customerName: project.customerName ?? null,
            },
            canvas: { id: canvas.id, name: canvas.name, reportUrl },
            supplier: {
              id: target.supplier.id,
              name: target.supplierName,
              email: target.email,
              productTypes: target.supplier.company.productTypes,
              employees: employeeSnapshots(target),
            },
            lines: target.lines,
          },
        });
        orderId = order.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sample Status could not be saved.";
        throw new Error(`STATUS:${message}`);
      }

      try {
        const result = await sendPurchaseSamplingEmail({
          to: target.email,
          sequence: approvedSend.sequence,
          supplierName: target.supplierName,
          projectName: project.name,
          canvasName: canvas.name,
          purchaseDate,
          reportUrl,
          updateUrl,
          qrCodeDataUrl,
          supplierDetails: [
            `Purchase date: ${purchaseDate}`,
            `CA: ${approvedSend.sequence}`,
            ...target.details,
          ],
        });
        await getCanvasStore().updateSampleOrderEmail(orderId, {
          status: "sent",
          error: null,
          sentAt: new Date().toISOString(),
        });
        return result;
      } catch (error) {
        await getCanvasStore().updateSampleOrderEmail(orderId, {
          status: "failed",
          error: error instanceof Error ? error.message : "Email delivery failed",
        });
        throw error;
      }
    }),
  );

  let sentCount = 0;
  let failedEmailCount = 0;
  let failedStatusCount = 0;
  let firstError: string | null = null;

  for (const result of results) {
    if (result.status === "fulfilled") {
      sentCount += 1;
      continue;
    }

    const message = result.reason instanceof Error ? result.reason.message : "Purchase send failed.";
    if (!firstError) firstError = message.startsWith("STATUS:") ? message.slice(7) : message;
    if (message.startsWith("STATUS:")) failedStatusCount += 1;
    else failedEmailCount += 1;
  }

  return { sentCount, failedEmailCount, failedStatusCount, firstError };
}
