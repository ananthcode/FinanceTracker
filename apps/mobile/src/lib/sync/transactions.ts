import { flowOf, isCounted, type TransactionLine, type TransactionView } from "@ft/core";
import type { SyncRow } from "./types";

/**
 * Synced transaction rows (wire shape, money as decimal strings) → the shared TransactionView, so
 * the phone uses the same packages/core balances and totals as the web (R4 US8). A row made on this
 * phone and not yet synced has no server fields: it is counted as active and not generated.
 */
export function transactionFromRow(row: SyncRow): TransactionView {
  const kind = row.kind as TransactionView["kind"];
  const personAction = (row.personAction as TransactionView["personAction"]) ?? null;
  const lines = Array.isArray(row.lines) ? (row.lines as Record<string, unknown>[]) : [];
  return {
    id: row.id,
    date: String(row.date ?? ""),
    timeOfDay: (row.timeOfDay as string | null) ?? null,
    kind,
    flow: (row.flow as TransactionView["flow"]) ?? flowOf(kind, personAction) ?? "out",
    accountId: (row.accountId as string | null) ?? null,
    toAccountId: (row.toAccountId as string | null) ?? null,
    amountMinor: BigInt(String(row.amountMinor ?? "0")),
    payeeId: (row.payeeId as string | null) ?? null,
    personAction,
    categoryId: (row.categoryId as string | null) ?? null,
    lines: lines.map(
      (l): TransactionLine => ({
        id: String(l.id),
        amountMinor: BigInt(String(l.amountMinor ?? "0")),
        categoryId: (l.categoryId as string | null) ?? null,
        personId: (l.personId as string | null) ?? null,
        personAction: (l.personAction as TransactionLine["personAction"]) ?? null,
        notes: (l.notes as string | null) ?? null,
        tagIds: Array.isArray(l.tagIds) ? (l.tagIds as string[]) : [],
      }),
    ),
    tagIds: Array.isArray(row.tagIds) ? (row.tagIds as string[]) : [],
    notes: (row.notes as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    status: (row.status as TransactionView["status"]) ?? "uncleared",
    confirmed: row.confirmed !== false,
    generated: row.generated === true,
    interestMonth: (row.interestMonth as string | null) ?? null,
    userEdited: row.userEdited === true,
    state: (row.state as TransactionView["state"]) ?? "active",
  };
}

export interface MonthSummary {
  income: bigint;
  /** Expenses less refunds. */
  expenses: bigint;
  cashflow: bigint;
}

/**
 * Home's cards for one month (`yyyy-MM`): counted income and expenses; refunds reduce expenses.
 * Transfers and person movements are not income or spending.
 */
export function monthSummary(transactions: readonly TransactionView[], month: string): MonthSummary {
  let income = 0n;
  let expenses = 0n;
  for (const tx of transactions) {
    if (!tx.date.startsWith(month) || !isCounted(tx)) continue;
    if (tx.kind === "income") income += tx.amountMinor;
    else if (tx.kind === "expense") expenses += tx.amountMinor;
    else if (tx.kind === "refund") expenses -= tx.amountMinor;
  }
  return { income, expenses, cashflow: income - expenses };
}

export type HomeFilter = "all" | "income" | "expenses";

/** The month's transactions grouped by day, newest first, with each day's net. */
export function byDay(
  transactions: readonly TransactionView[],
  month: string,
  filter: HomeFilter,
): { date: string; net: bigint; items: TransactionView[] }[] {
  const shown = transactions
    .filter((t) => t.state === "active" && t.date.startsWith(month))
    .filter((t) => filter === "all" || (filter === "income" ? t.kind === "income" : t.kind === "expense" || t.kind === "refund"))
    .sort((a, b) => (a.date === b.date ? (b.timeOfDay ?? "").localeCompare(a.timeOfDay ?? "") : b.date.localeCompare(a.date)));
  const days = new Map<string, TransactionView[]>();
  for (const t of shown) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  return [...days].map(([date, items]) => ({ date, items, net: items.reduce((s, t) => s + signedAmount(t), 0n) }));
}

/** + for money in, − for money out; transfers count as 0 in a day's net. */
export function signedAmount(tx: TransactionView): bigint {
  if (!isCounted(tx) || tx.kind === "transfer") return 0n;
  return tx.flow === "in" ? tx.amountMinor : -tx.amountMinor;
}
