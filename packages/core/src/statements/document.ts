/**
 * What a shared statement says, as text (R6 FR-011; spec US4 3, 5): the app draws exactly this into the
 * PNG and PDF. Real amounts always (a file is made to be sent, so hide-balances does not apply); the
 * user's display name, the person, the range, the rows and the closing balance, and nothing else of
 * theirs. Notes only when the user turned them on for this download.
 */
import { formatDate, type DateFormat } from "../dates";
import { formatMoney, type MoneyFormatPrefs } from "../money/format";
import { statementClosing, statementSignMeaning, type PersonStatement } from "./statement";

export interface StatementDocumentRow {
  date: string;
  label: string;
  notes: string | null;
  amount: string;
  balance: string;
}

export interface StatementDocument {
  title: string;
  source: string;
  range: string;
  meaning: string;
  opening: string;
  rows: StatementDocumentRow[];
  /** Said when there are no rows (US4 4). */
  empty: string | null;
  closing: string;
}

/** The sign a figure shows with: a true minus, and "+" only where asked for. */
export function signedMoney(minor: bigint, currency: string, prefs: MoneyFormatPrefs, plus: boolean): string {
  const text = formatMoney(minor < 0n ? -minor : minor, currency, prefs);
  return minor < 0n ? `−${text}` : plus && minor > 0n ? `+${text}` : text;
}

export function statementDocument(
  statement: PersonStatement,
  input: {
    personName: string;
    displayName: string;
    currency: string;
    prefs: MoneyFormatPrefs & { dateFormat: DateFormat };
    includeNotes: boolean;
  },
): StatementDocument {
  const { personName, displayName, currency, prefs, includeNotes } = input;
  const closing = statementClosing(personName, statement.realClosingMinor);
  return {
    title: `Statement for ${personName}`,
    source: `From ${displayName}`,
    range: `${formatDate(statement.from, prefs)} to ${formatDate(statement.to, prefs)}`,
    meaning: statementSignMeaning(personName, statement.sign),
    opening: signedMoney(statement.openingMinor, currency, prefs, false),
    rows: statement.rows.map((r) => ({
      date: formatDate(r.date, prefs),
      label: r.label,
      notes: includeNotes ? r.notes : null,
      amount: signedMoney(r.amountMinor, currency, prefs, true),
      balance: signedMoney(r.balanceMinor, currency, prefs, false),
    })),
    empty: statement.rows.length === 0 ? "No movements in this period." : null,
    closing: closing.amountMinor === null ? closing.words : `${closing.words} ${formatMoney(closing.amountMinor, currency, prefs)}`,
  };
}

/** The download's name: it says who and when (FR-011); characters files can't carry are dropped. */
export function statementFileName(personName: string, from: string, to: string, extension: "png" | "pdf"): string {
  const safe = personName.replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || "person";
  return `Statement - ${safe} - ${from} to ${to}.${extension}`;
}
