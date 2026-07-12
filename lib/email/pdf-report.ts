import "server-only";

import PDFDocument from "pdfkit";

export async function renderCanvasReportPdf({
  title,
  customerName,
  text,
}: {
  title: string;
  customerName: string;
  text: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font("Helvetica-Bold").fontSize(18).text(title);
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(9).text(text, { lineGap: 2 });

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.font("Helvetica").fontSize(8).fillColor("#555555");
      doc.text(
        `${customerName} - ${title}`,
        42,
        24,
        { width: 360, lineBreak: false },
      );
      doc.text(`Page ${index + 1} of ${range.count}`, 430, 24, {
        width: 123,
        align: "right",
        lineBreak: false,
      });
      doc.fillColor("#111111");
    }

    doc.end();
  });
}
