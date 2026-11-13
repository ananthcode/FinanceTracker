import type { JpegPage, StatementDocument, StatementDocumentRow } from "@ft/core";

/**
 * Draws a statement on canvases, page by page (R6 research R6-06): A4 proportions at 150 dpi, so a
 * PDF prints crisply. Nothing leaves the browser. Black on white whatever the app's theme: the file is
 * made to be sent.
 */
const WIDTH = 1240;
const HEIGHT = 1754;
const MARGIN = 90;
const FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const INK = "#111111";
const SOFT = "#555555";
const RULE = "#bbbbbb";

// Column edges: date and type start at their x; amount and balance end at theirs.
const COL = { date: MARGIN, label: MARGIN + 190, amount: WIDTH - MARGIN - 220, balance: WIDTH - MARGIN };
const LABEL_WIDTH = COL.amount - 180 - COL.label;
const LINE = 32;
const NOTE_LINE = 28;
const ROW_GAP = 14;
const FOOTER_TOP = HEIGHT - MARGIN;

const textFont = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface LaidOutRow {
  row: StatementDocumentRow;
  label: string[];
  notes: string[];
  height: number;
}

function layoutRows(ctx: CanvasRenderingContext2D, rows: StatementDocumentRow[]): LaidOutRow[] {
  return rows.map((row) => {
    ctx.font = textFont(26);
    const label = wrap(ctx, row.label, LABEL_WIDTH);
    ctx.font = textFont(22);
    const notes = row.notes ? wrap(ctx, row.notes, LABEL_WIDTH) : [];
    return { row, label, notes, height: label.length * LINE + notes.length * NOTE_LINE + ROW_GAP };
  });
}

const HEADER_HEIGHT = 300; // title block, first page only
const TABLE_HEAD = 60;
const CLOSING_HEIGHT = 170;

/** Splits rows over pages, keeping the closing block on the last page. */
function paginate(rows: LaidOutRow[]): LaidOutRow[][] {
  const pages: LaidOutRow[][] = [[]];
  let y = MARGIN + HEADER_HEIGHT + TABLE_HEAD;
  for (const r of rows) {
    if (y + r.height > FOOTER_TOP - 40) {
      pages.push([]);
      y = MARGIN + TABLE_HEAD;
    }
    pages[pages.length - 1]!.push(r);
    y += r.height;
  }
  if (y + CLOSING_HEIGHT > FOOTER_TOP - 40) pages.push([]);
  return pages;
}

function drawTableHead(ctx: CanvasRenderingContext2D, top: number): number {
  ctx.font = textFont(22, 600);
  ctx.fillStyle = SOFT;
  ctx.textAlign = "left";
  ctx.fillText("Date", COL.date, top + 26);
  ctx.fillText("Type", COL.label, top + 26);
  ctx.textAlign = "right";
  ctx.fillText("Amount", COL.amount, top + 26);
  ctx.fillText("Balance", COL.balance, top + 26);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, top + 42);
  ctx.lineTo(WIDTH - MARGIN, top + 42);
  ctx.stroke();
  return top + TABLE_HEAD;
}

export function drawStatementPages(doc: StatementDocument): HTMLCanvasElement[] {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("CANVAS_UNAVAILABLE");
  const pages = paginate(layoutRows(measure, doc.rows));

  return pages.map((rows, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textBaseline = "alphabetic";

    let y = MARGIN;
    if (index === 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = textFont(46, 700);
      ctx.fillText(doc.title, MARGIN, y + 44);
      ctx.font = textFont(26);
      ctx.fillText(doc.source, MARGIN, y + 96);
      ctx.fillText(doc.range, MARGIN, y + 134);
      ctx.fillStyle = SOFT;
      ctx.font = textFont(22);
      ctx.fillText(doc.meaning, MARGIN, y + 172);
      ctx.fillStyle = INK;
      ctx.font = textFont(28, 600);
      ctx.fillText("Opening balance", MARGIN, y + 240);
      ctx.textAlign = "right";
      ctx.fillText(doc.opening, COL.balance, y + 240);
      y += HEADER_HEIGHT;
    }

    if (rows.length > 0) y = drawTableHead(ctx, y);
    for (const r of rows) {
      ctx.fillStyle = INK;
      ctx.font = textFont(26);
      ctx.textAlign = "left";
      ctx.fillText(r.row.date, COL.date, y + 26);
      r.label.forEach((line, i) => ctx.fillText(line, COL.label, y + 26 + i * LINE));
      ctx.textAlign = "right";
      ctx.fillText(r.row.amount, COL.amount, y + 26);
      ctx.fillText(r.row.balance, COL.balance, y + 26);
      if (r.notes.length > 0) {
        ctx.textAlign = "left";
        ctx.fillStyle = SOFT;
        ctx.font = textFont(22);
        r.notes.forEach((line, i) => ctx.fillText(line, COL.label, y + r.label.length * LINE + 22 + i * NOTE_LINE));
      }
      y += r.height;
    }

    if (index === pages.length - 1) {
      if (doc.empty) {
        ctx.textAlign = "left";
        ctx.fillStyle = SOFT;
        ctx.font = textFont(26);
        ctx.fillText(doc.empty, MARGIN, y + 26);
        y += 60;
      }
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(MARGIN, y + 20);
      ctx.lineTo(WIDTH - MARGIN, y + 20);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = SOFT;
      ctx.font = textFont(24);
      ctx.fillText("Closing balance", MARGIN, y + 66);
      ctx.fillStyle = INK;
      ctx.font = textFont(36, 700);
      ctx.fillText(doc.closing, MARGIN, y + 116);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = SOFT;
    ctx.font = textFont(20);
    ctx.fillText(`Page ${index + 1} of ${pages.length}`, WIDTH - MARGIN, HEIGHT - 50);
    return canvas;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("CANVAS_EXPORT_FAILED"))), type, quality);
  });
}

/** The pages stacked into one tall image. Browsers cap a canvas's height, which a very long statement can pass. */
export async function pagesToPng(pages: HTMLCanvasElement[]): Promise<Blob> {
  const height = pages.reduce((sum, p) => sum + p.height, 0);
  if (height > MAX_PNG_HEIGHT) throw new Error("STATEMENT_TOO_LONG_FOR_IMAGE");
  const stacked = document.createElement("canvas");
  stacked.width = WIDTH;
  stacked.height = height;
  const ctx = stacked.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  let y = 0;
  for (const page of pages) {
    ctx.drawImage(page, 0, y);
    y += page.height;
  }
  return toBlob(stacked, "image/png");
}
const MAX_PNG_HEIGHT = 30_000;

/** The pages as JPEGs for the PDF writer. */
export async function pagesToJpeg(pages: HTMLCanvasElement[]): Promise<JpegPage[]> {
  return Promise.all(
    pages.map(async (page) => ({
      jpeg: new Uint8Array(await (await toBlob(page, "image/jpeg", 0.92)).arrayBuffer()),
      widthPx: page.width,
      heightPx: page.height,
    })),
  );
}
