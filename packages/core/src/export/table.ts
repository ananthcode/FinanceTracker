/** A table of an export (one sheet / one CSV file), R10-03. */

/** A cell: text, a number, yes/no, a calendar date, an amount in paise, or empty. */
export type Cell = string | number | boolean | null | { date: string } | { money: bigint };

export interface ExportTable {
  /** Sheet name (≤ 31 characters). */
  name: string;
  /** CSV file name, without the extension. */
  file: string;
  columns: string[];
  rows: Cell[][];
}

/** Paise → "1234.50" / "-12.05" (exact, no float). */
export function rupeesText(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const paise = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${paise}`;
}

/** Text a spreadsheet would read as a formula (FR-005). */
export const looksLikeFormula = (s: string) => /^[=+\-@\t\r]/.test(s);
