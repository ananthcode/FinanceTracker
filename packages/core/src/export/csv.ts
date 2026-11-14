/**
 * CSV for the spreadsheet export (R10-03, FR-003, FR-005): RFC 4180 quoting, UTF-8 with a byte-order mark so
 * Excel reads it, `yyyy-MM-dd` dates, amounts like `1234.50`. Text that a spreadsheet would read as a formula
 * starts with an apostrophe, so it shows as text and never runs.
 */
import { looksLikeFormula, rupeesText, type Cell, type ExportTable } from "./table";

function cellText(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "boolean") return c ? "Yes" : "No";
  if (typeof c === "number") return String(c);
  if (typeof c === "string") return looksLikeFormula(c) ? `'${c}` : c;
  if ("date" in c) return c.date;
  return rupeesText(c.money);
}

const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The table as CSV text (with the BOM). */
export function toCsv(table: ExportTable): string {
  const lines = [table.columns.map(quote).join(","), ...table.rows.map((r) => r.map((c) => quote(cellText(c))).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
