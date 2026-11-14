/**
 * A synthetic receipt for the demo household (R9 FR-014, constitution V): a one-page PDF written here,
 * plainly marked as made-up. Plain ASCII text in a standard font, so every PDF reader opens it.
 */

/** The demo receipt's attachment name. */
export const DEMO_RECEIPT_NAME = "Refrigerator receipt (demo).pdf";

const escapePdf = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** A one-page PDF with the given lines of text (ASCII), top to bottom. */
export function textPdf(lines: readonly string[]): Uint8Array {
  const text = lines.map((l, i) => `${i === 0 ? "" : "0 -22 Td "}(${escapePdf(l.replace(/[^\x20-\x7e]/g, "?"))}) Tj`).join("\n");
  const stream = `BT\n/F1 13 Tf\n40 780 Td\n${text}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** The demo refrigerator's receipt (see demoTransactions): same date and amount as the transaction. */
export function demoReceiptPdf(purchaseDate: string, amountText: string, warrantyUntil: string): Uint8Array {
  return textPdf([
    "SAMPLE RECEIPT - DEMO DATA, NOT A REAL PURCHASE",
    "",
    "Brightline Appliances (a made-up shop)",
    `Date: ${purchaseDate}`,
    "",
    "Refrigerator, 260 L, double door        x1",
    `Total paid: Rs. ${amountText}`,
    "",
    `Warranty: 18 months, until ${warrantyUntil}`,
    "Keep this receipt for warranty claims.",
  ]);
}
