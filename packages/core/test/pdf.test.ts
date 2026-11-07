import { describe, expect, it } from "vitest";
import { A4_POINTS, pdfFromJpegPages } from "../src";

/** R6 T016 — the PDF writer's output parses: header, objects, cross-reference offsets, page count (research R6-06). */
const text = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");
// Stand-ins for JPEG data: the writer never looks inside, and these bytes must survive unchanged.
const jpeg = (n: number) => Uint8Array.from({ length: 300 + n }, (_, i) => (i * 7 + n) % 256);
const page = (n: number) => ({ jpeg: jpeg(n), widthPx: 1240, heightPx: 1754 });

function xrefOf(pdf: string) {
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)![1]);
  expect(pdf.slice(start, start + 5)).toBe("xref\n");
  const [, first, size] = /^xref\n(\d+) (\d+)\n/.exec(pdf.slice(start))!;
  expect(first).toBe("0");
  const entries = pdf.slice(start).split("\n").slice(2, 2 + Number(size));
  return { size: Number(size), entries, trailer: pdf.slice(start) };
}

describe("pdfFromJpegPages", () => {
  it("writes a valid header, one page per image and a correct cross-reference table", () => {
    const pdf = text(pdfFromJpegPages([page(1), page(2), page(3)]));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Count 3");
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(3);
    expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(3);
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(3);
    expect(pdf).toContain(`/MediaBox [0 0 ${A4_POINTS.width} ${A4_POINTS.height}]`);
    expect(pdf).toContain("/Width 1240 /Height 1754");

    const { size, entries, trailer } = xrefOf(pdf);
    expect(size).toBe(1 + 2 + 3 * 3); // the free entry, catalog and pages, then page, content and image each
    expect(entries[0]).toBe("0000000000 65535 f ");
    entries.slice(1).forEach((entry, i) => {
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      const at = Number(entry.slice(0, 10));
      expect(pdf.slice(at).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1}`).toBe(true);
    });
    expect(trailer).toContain(`/Size ${size} /Root 1 0 R`);
  });

  it("embeds each image's bytes unchanged with the right length", () => {
    const pages = [page(1), page(50)];
    const pdf = text(pdfFromJpegPages(pages));
    for (const p of pages) {
      const data = text(p.jpeg);
      const at = pdf.indexOf(data);
      expect(at).toBeGreaterThan(0);
      expect(pdf.slice(at - 7, at)).toBe("stream\n");
      expect(pdf.slice(at + data.length, at + data.length + 10)).toBe("\nendstream");
      expect(pdf).toContain(`/Length ${data.length}`);
    }
  });

  it("carries nothing but the pages: no title, author or dates", () => {
    const pdf = text(pdfFromJpegPages([page(1)]));
    expect(pdf).not.toMatch(/\/Info|\/Title|\/Author|\/CreationDate/);
  });

  it("refuses to write a file with no pages", () => {
    expect(() => pdfFromJpegPages([])).toThrow();
  });
});
