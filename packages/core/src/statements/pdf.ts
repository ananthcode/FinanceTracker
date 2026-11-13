/**
 * A minimal PDF writer (R6 research R6-06): one page per image, each a JPEG embedded as it is
 * (DCTDecode), with a correct cross-reference table. The statement is drawn by the app, so no fonts or
 * text are needed here, and the file carries nothing but the pages (no title, author or dates).
 */

/** A4 in PDF points. */
export const A4_POINTS = { width: 595, height: 842 } as const;

export interface JpegPage {
  jpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
}

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

export function pdfFromJpegPages(pages: readonly JpegPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("PDF_NO_PAGES");

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? ascii(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    write(`${id} 0 obj\n${body}\n`);
    if (stream) {
      write("stream\n");
      write(stream);
      write("\nendstream\n");
    }
    write("endobj\n");
  };

  // Objects: 1 catalog, 2 page tree, then three per page (page, its content, its image).
  const pageId = (i: number) => 3 + i * 3;
  // The binary comment marks the file as binary for tools that guess.
  write("%PDF-1.4\n%");
  write(Uint8Array.of(0xe2, 0xe3, 0xcf, 0xd3));
  write("\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`);
  pages.forEach((page, i) => {
    const id = pageId(i);
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_POINTS.width} ${A4_POINTS.height}] /Contents ${id + 1} 0 R /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> >>`,
    );
    const content = ascii(`q ${A4_POINTS.width} 0 0 ${A4_POINTS.height} 0 0 cm /Im0 Do Q`);
    object(id + 1, `<< /Length ${content.length} >>`, content);
    object(
      id + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
  });

  const size = 3 + pages.length * 3;
  const xref = length;
  write(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let id = 1; id < size; id++) write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  write(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
