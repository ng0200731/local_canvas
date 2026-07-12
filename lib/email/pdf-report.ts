import "server-only";

import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import type { CanvasReportPayload } from "@/lib/email/schemas";

interface LegacyReportInput {
  title: string;
  customerName: string;
  text: string;
}

type ReportInput = LegacyReportInput & {
  report?: CanvasReportPayload;
};

const PAGE_MARGIN = 42;
const HEADER_HEIGHT = 54;
const FOOTER_HEIGHT = 24;
const BLOCK_GAP = 14;

type SupportedPdfImageMime = "image/png" | "image/jpeg";

function supportedMimeFromBuffer(buffer: Buffer): SupportedPdfImageMime | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  return null;
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/[-+.\w]+;base64,/i.test(value);
}

async function convertToPdfImageBuffer(buffer: Buffer): Promise<Buffer | null> {
  try {
    const sharpModule = await import("sharp");
    return await sharpModule.default(buffer).png().toBuffer();
  } catch (error) {
    if (supportedMimeFromBuffer(buffer)) return buffer;
    console.warn("Canvas report PDF image conversion failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function imageBufferFromDataUrl(value: string): Promise<Buffer | null> {
  const match = /^data:(image\/[-+.\w]+);base64,(.+)$/i.exec(value);
  if (!match) return null;

  const buffer = Buffer.from(match[2] ?? "", "base64");
  return convertToPdfImageBuffer(buffer);
}

async function imageBufferFromUrl(value: string): Promise<Buffer | null> {
  if (isDataImageUrl(value)) return imageBufferFromDataUrl(value);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return convertToPdfImageBuffer(buffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function collectImageBuffers(report: CanvasReportPayload): Promise<Map<string, Buffer>> {
  const entries = report.sections
    .flatMap((section) => section.blocks)
    .filter((block) => block.image?.url)
    .map((block) => [block.id, block.image?.url ?? ""] as const);
  const buffers = await Promise.all(
    entries.map(async ([id, url]) => [id, await imageBufferFromUrl(url)] as const),
  );
  buffers.forEach(([id, buffer]) => {
    if (buffer) return;
    console.warn("Canvas report PDF image could not be embedded.", { blockId: id });
  });

  return new Map(
    buffers.filter((entry): entry is readonly [string, Buffer] => entry[1] instanceof Buffer),
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function addHeader(doc: PDFKit.PDFDocument, report: CanvasReportPayload) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111");
  doc.text(report.title, PAGE_MARGIN, 24, { width: width * 0.54, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#555555");
  doc.text(`Customer: ${report.project.customerName}`, PAGE_MARGIN, 40, {
    width: width * 0.54,
    lineBreak: false,
  });
  doc.text(
    `Contact: ${[report.project.employeeName, report.project.employeeTitle].filter(Boolean).join(" / ")}`,
    PAGE_MARGIN + width * 0.58,
    24,
    { width: width * 0.42, align: "right", lineBreak: false },
  );
  doc.text(`Email: ${report.project.employeeEmail}`, PAGE_MARGIN + width * 0.58, 40, {
    width: width * 0.42,
    align: "right",
    lineBreak: false,
  });
  doc.moveTo(PAGE_MARGIN, HEADER_HEIGHT + 8).lineTo(PAGE_MARGIN + width, HEADER_HEIGHT + 8);
  doc.strokeColor("#dddddd").lineWidth(0.8).stroke();
  doc.fillColor("#111111");
}

function addFooters(doc: PDFKit.PDFDocument, report: CanvasReportPayload) {
  const range = doc.bufferedPageRange();
  const width = doc.page.width - PAGE_MARGIN * 2;
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    addHeader(doc, report);
    doc.font("Helvetica").fontSize(8).fillColor("#666666");
    doc.text(
      `Generated: ${formatDateTime(report.generatedAt)} | ${report.project.currency} | ${report.project.destination}`,
      PAGE_MARGIN,
      doc.page.height - PAGE_MARGIN + 12,
      { width: width * 0.7, lineBreak: false },
    );
    doc.text(
      `Page ${index + 1} of ${range.count}`,
      PAGE_MARGIN,
      doc.page.height - PAGE_MARGIN + 12,
      {
        width,
        align: "right",
        lineBreak: false,
      },
    );
    doc.fillColor("#111111");
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number, report: CanvasReportPayload) {
  const bottom = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;
  if (doc.y + height <= bottom) return;
  doc.addPage();
  addHeader(doc, report);
  doc.y = PAGE_MARGIN + HEADER_HEIGHT;
}

function drawDetails(
  doc: PDFKit.PDFDocument,
  details: CanvasReportPayload["sections"][number]["blocks"][number]["details"],
  x: number,
  y: number,
  width: number,
): number {
  let cursorY = y;
  for (const detail of details) {
    const labelWidth = 110;
    const valueWidth = width - labelWidth - 10;
    const valueHeight = doc.heightOfString(detail.value, { width: valueWidth });
    const rowHeight = Math.max(16, valueHeight + 4);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#666666");
    doc.text(detail.label, x, cursorY + 2, { width: labelWidth });
    doc.font("Helvetica").fontSize(8).fillColor("#111111");
    doc.text(detail.value, x + labelWidth + 10, cursorY + 2, { width: valueWidth });
    cursorY += rowHeight;
  }
  return cursorY;
}

function tableHeight(
  table: NonNullable<CanvasReportPayload["sections"][number]["blocks"][number]["table"]>,
): number {
  return 24 + table.rows.length * 26;
}

function drawSupplierMatrix(
  doc: PDFKit.PDFDocument,
  table: NonNullable<CanvasReportPayload["sections"][number]["blocks"][number]["table"]>,
  x: number,
  y: number,
  width: number,
): number {
  const columns = ["Supplier", ...table.columns];
  const rowHeight = 26;
  const headerHeight = 24;
  const firstColumnWidth = 86;
  const remainingWidth = width - firstColumnWidth;
  const otherColumnWidth = remainingWidth / Math.max(1, columns.length - 1);
  const columnWidths = columns.map((_, index) =>
    index === 0 ? firstColumnWidth : otherColumnWidth,
  );
  let cursorX = x;

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#111111");
  columns.forEach((column, index) => {
    const columnWidth = columnWidths[index] ?? otherColumnWidth;
    doc.rect(cursorX, y, columnWidth, headerHeight).fillAndStroke("#f5ead0", "#decda6");
    doc.fillColor("#111111").text(column, cursorX + 4, y + 7, {
      width: columnWidth - 8,
      height: headerHeight - 8,
      ellipsis: true,
    });
    cursorX += columnWidth;
  });

  table.rows.forEach((row, rowIndex) => {
    const rowY = y + headerHeight + rowIndex * rowHeight;
    const values = [row.label, ...row.values];
    cursorX = x;
    values.forEach((value, columnIndex) => {
      const columnWidth = columnWidths[columnIndex] ?? otherColumnWidth;
      const isHeaderColumn = columnIndex === 0;
      const isTotalRow = row.label.toLocaleLowerCase() === "total";
      const fill = isHeaderColumn ? "#fff8ea" : isTotalRow ? "#fff4d8" : "#ffffff";
      doc.rect(cursorX, rowY, columnWidth, rowHeight).fillAndStroke(fill, "#eadfca");
      doc
        .font(isHeaderColumn || isTotalRow ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7)
        .fillColor("#111111")
        .text(value, cursorX + 4, rowY + 6, {
          width: columnWidth - 8,
          height: rowHeight - 8,
          ellipsis: true,
        });
      cursorX += columnWidth;
    });
  });

  doc.fillColor("#111111");
  return y + tableHeight(table) + 8;
}

function drawImage(
  doc: PDFKit.PDFDocument,
  buffer: Buffer | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  fallback: string,
) {
  doc.roundedRect(x, y, width, height, 6).fillAndStroke("#f2f2f0", "#dddddd");
  if (!buffer) {
    doc.font("Helvetica").fontSize(8).fillColor("#777777");
    doc.text(fallback, x + 10, y + height / 2 - 8, { width: width - 20, align: "center" });
    doc.fillColor("#111111");
    return;
  }

  try {
    doc.image(buffer, x + 8, y + 8, {
      fit: [width - 16, height - 16],
      align: "center",
      valign: "center",
    });
  } catch {
    doc.font("Helvetica").fontSize(8).fillColor("#777777");
    doc.text("Image format is not supported in PDF.", x + 10, y + height / 2 - 8, {
      width: width - 20,
      align: "center",
    });
    doc.fillColor("#111111");
  }
}

function drawBlock(
  doc: PDFKit.PDFDocument,
  report: CanvasReportPayload,
  block: CanvasReportPayload["sections"][number]["blocks"][number],
  images: Map<string, Buffer>,
) {
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const imageWidth = 190;
  const detailsWidth = contentWidth - imageWidth - 18;
  const detailHeight = block.details.reduce(
    (height, detail) =>
      height + Math.max(16, doc.heightOfString(detail.value, { width: detailsWidth - 120 }) + 4),
    38 + (block.table ? tableHeight(block.table) + 8 : 0),
  );
  const blockHeight = Math.max(170, Math.min(520, detailHeight + 18));

  ensureSpace(doc, blockHeight + BLOCK_GAP, report);
  const top = doc.y;
  doc.roundedRect(PAGE_MARGIN, top, contentWidth, blockHeight, 8).strokeColor("#dddddd").stroke();

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111");
  doc.text(block.title, PAGE_MARGIN + 12, top + 12, { width: detailsWidth });
  if (block.subtitle) {
    doc.font("Helvetica").fontSize(8).fillColor("#666666");
    doc.text(block.subtitle, PAGE_MARGIN + 12, top + 28, { width: detailsWidth });
  }

  const detailTop = top + (block.subtitle ? 46 : 34);
  const afterTable = block.table
    ? drawSupplierMatrix(doc, block.table, PAGE_MARGIN + 12, detailTop, detailsWidth)
    : detailTop;
  drawDetails(doc, block.details, PAGE_MARGIN + 12, afterTable, detailsWidth);
  drawImage(
    doc,
    images.get(block.id),
    PAGE_MARGIN + detailsWidth + 18,
    top + 12,
    imageWidth - 12,
    blockHeight - 24,
    block.image?.url ? "Image URL included in email HTML." : "No image",
  );

  doc.y = top + blockHeight + BLOCK_GAP;
}

function drawReport(
  doc: PDFKit.PDFDocument,
  report: CanvasReportPayload,
  images: Map<string, Buffer>,
) {
  addHeader(doc, report);
  doc.y = PAGE_MARGIN + HEADER_HEIGHT;

  for (const section of report.sections) {
    if (section.blocks.length === 0) continue;
    if (section.pageBreakBefore) {
      doc.addPage();
      addHeader(doc, report);
      doc.y = PAGE_MARGIN + HEADER_HEIGHT;
    }
    ensureSpace(doc, 34, report);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#111111");
    doc.text(section.title, PAGE_MARGIN, doc.y + 6);
    doc.moveDown(0.5);
    for (const block of section.blocks) drawBlock(doc, report, block, images);
  }

  ensureSpace(doc, 60, report);
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Canvas log", PAGE_MARGIN, doc.y + 8);
  doc.moveDown(0.6);
  report.steps.forEach((step, index) => {
    ensureSpace(doc, 34, report);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${index + 1}. ${step.title}`, PAGE_MARGIN, doc.y);
    doc.font("Helvetica").fontSize(8).fillColor("#333333");
    doc.text(step.detail, PAGE_MARGIN + 14, doc.y + 3, {
      width: doc.page.width - PAGE_MARGIN * 2 - 14,
    });
    doc.moveDown(0.7);
    doc.fillColor("#111111");
  });
}

function legacyReport(input: LegacyReportInput): CanvasReportPayload {
  return {
    title: input.title,
    generatedAt: new Date().toISOString(),
    project: {
      name: input.customerName,
      customerName: input.customerName,
      employeeName: "Not set",
      employeeTitle: "",
      employeeEmail: "Not set",
      employeeTel: "Not set",
      currency: "Not set",
      destination: "Not set",
    },
    sections: [
      {
        id: "report-text",
        title: "Report",
        blocks: [
          {
            id: "report-text",
            title: input.title,
            details: [{ label: "Content", value: input.text }],
            image: null,
          },
        ],
      },
    ],
    steps: [],
  };
}

export async function renderCanvasReportPdf(input: ReportInput): Promise<Buffer> {
  const report = input.report ?? legacyReport(input);
  const images = await collectImageBuffers(report);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    drawReport(doc, report, images);
    addFooters(doc, report);
    doc.end();
  });
}
