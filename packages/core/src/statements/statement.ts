/**
 * Person statements (R6 FR-009, FR-010, FR-012; research R6-05). Opening = the opening balance plus
 * counted effects before the range; rows = counted movements in the range with the running balance;
 * closing = the balance at the range's end. Exact bigint paise, from R4's postings, so the closing
 * balance always equals the person's balance rules.
 */
import { personLabel } from "../people";
import type { StatementSign } from "../payees/types";
import type { Period } from "../reports";
import { transactionLabel } from "../transactions/labels";
import { personEffectOf } from "../transactions/totals";
import type { TransactionView } from "../transactions/types";

/** The sign setting as the screen and the files say it (FR-010). */
export const STATEMENT_SIGN_TEXT: Record<StatementSign, string> = {
  they_owe_positive: "They owe me is positive",
  i_owe_positive: "I owe them is positive",
};

export interface StatementRow {
  transactionId: string;
  date: string;
  /** The type in words; never an account name. */
  label: string;
  notes: string | null;
  /** As displayed under the sign setting. */
  amountMinor: bigint;
  /** As displayed under the sign setting. */
  balanceMinor: bigint;
}

export interface PersonStatement {
  from: string;
  to: string;
  sign: StatementSign;
  /** As displayed under the sign setting. */
  openingMinor: bigint;
  rows: StatementRow[];
  /** As displayed under the sign setting. */
  closingMinor: bigint;
  /** Positive when they owe the user, whatever the sign setting: the words come from this. */
  realClosingMinor: bigint;
}

type StatementTx = Parameters<typeof personEffectOf>[0] & Pick<TransactionView, "id" | "timeOfDay" | "notes" | "personAction">;

/** A split share is said without its account: "Share of spending at Fresh Mart". */
function shareLabel(tx: StatementTx, businessName: (payeeId: string) => string): string {
  const payee = tx.payeeId ? businessName(tx.payeeId) : "";
  switch (tx.kind) {
    case "income":
      return payee ? `Share of income from ${payee}` : "Share of income";
    case "refund":
      return payee ? `Share of refund from ${payee}` : "Share of refund";
    default:
      return payee ? `Share of spending at ${payee}` : "Share of spending";
  }
}

/**
 * Builds the statement from the person's transactions as the search returns them (newest first;
 * uncounted ones are skipped). `businessName` names the payee of a split share: return "" for another
 * person, so a statement never names anyone else (US4 3).
 */
export function personStatement(
  person: { id: string; name: string; openingBalanceMinor: bigint; statementSign: StatementSign },
  newestFirst: readonly StatementTx[],
  range: Period,
  businessName: (payeeId: string) => string,
): PersonStatement {
  const shown = person.statementSign === "i_owe_positive" ? -1n : 1n;
  // Oldest first; a stable sort keeps the search's entry order within a day and time.
  const oldestFirst = [...newestFirst].reverse().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const [x, y] = [a.timeOfDay ?? "", b.timeOfDay ?? ""];
    return x === y ? 0 : x < y ? -1 : 1;
  });

  let balance = person.openingBalanceMinor;
  for (const tx of oldestFirst) {
    if (tx.date < range.from) balance += personEffectOf(tx, person.id);
  }
  const opening = balance;

  const rows: StatementRow[] = [];
  for (const tx of oldestFirst) {
    if (tx.date < range.from || tx.date > range.to) continue;
    const effect = personEffectOf(tx, person.id);
    if (effect === 0n) continue;
    balance += effect;
    rows.push({
      transactionId: tx.id,
      date: tx.date,
      label:
        tx.kind === "person" || tx.kind === "interest"
          ? transactionLabel(tx, { account: () => "", payee: () => person.name })
          : shareLabel(tx, businessName),
      notes: tx.notes,
      amountMinor: shown * effect,
      balanceMinor: shown * balance,
    });
  }

  return {
    from: range.from,
    to: range.to,
    sign: person.statementSign,
    openingMinor: shown * opening,
    rows,
    closingMinor: shown * balance,
    realClosingMinor: balance,
  };
}

/** The closing balance in words, in the real direction whatever the sign setting (US4 2). */
export function statementClosing(name: string, realClosingMinor: bigint): { words: string; amountMinor: bigint | null } {
  switch (personLabel(realClosingMinor)) {
    case "owes_you":
      return { words: `${name} owes you`, amountMinor: realClosingMinor };
    case "you_owe":
      return { words: `You owe ${name}`, amountMinor: -realClosingMinor };
    case "settled":
      return { words: `Settled with ${name}`, amountMinor: null };
  }
}

/** What a positive figure means on this statement, said on the screen and in the files. */
export function statementSignMeaning(name: string, sign: StatementSign): string {
  return sign === "i_owe_positive" ? `Positive amounts mean you owe ${name}.` : `Positive amounts mean ${name} owes you.`;
}
