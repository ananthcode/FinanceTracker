/**
 * Likely matches, "Pays:" suggestions and the Pay pre-fill (research R7-07, R7-10; FR-010, FR-011,
 * FR-013). One rule everywhere: an active, unlinked transaction to the same payee, card or person,
 * with an amount within ±20 % of what is left and a date within 10 days of the due date or in the
 * item's month. Nothing is linked silently: these only suggest.
 */
import type { TransactionKind, TransactionView } from "../transactions/types";
import { daysBetween, monthName, monthOf } from "./months";
import type { PlanRow } from "./month";
import type { Month, PlanItem } from "./schemas";

/** What a transaction (or one being entered) is paid to. */
export type PayShape = Pick<TransactionView, "kind" | "payeeId" | "toAccountId" | "personAction">;

const OUT_ACTIONS = ["lent", "repaid_to", "paid_on_behalf"];

/** Same payee (an expense), same card (a transfer into it) or same person (money out to them). */
export function paysTarget(item: Pick<PlanItem, "target" | "payeeId" | "cardAccountId">, t: PayShape): boolean {
  switch (item.target) {
    case "payee":
      return t.kind === "expense" && t.payeeId !== null && t.payeeId === item.payeeId;
    case "card":
      return t.kind === "transfer" && t.toAccountId !== null && t.toAccountId === item.cardAccountId;
    case "person":
      return t.kind === "person" && t.payeeId !== null && t.payeeId === item.payeeId && OUT_ACTIONS.includes(t.personAction ?? "");
  }
}

/** Within ±20 % of what is left, in whole paise: 100·|a − left| ≤ 20·left (constitution II: no rounding). */
export function amountNear(amountMinor: bigint, leftMinor: bigint): boolean {
  if (leftMinor <= 0n) return false;
  const diff = amountMinor > leftMinor ? amountMinor - leftMinor : leftMinor - amountMinor;
  return 100n * diff <= 20n * leftMinor;
}

/** Within 10 days of the due date, or in the item's month. */
export function dateNear(date: string, row: Pick<PlanRow, "dueDate" | "month">): boolean {
  return monthOf(date) === row.month || Math.abs(daysBetween(row.dueDate, date)) <= 10;
}

const closeness = (amountMinor: bigint, date: string, row: Pick<PlanRow, "leftMinor" | "dueDate">) => ({
  diff: amountMinor > row.leftMinor ? amountMinor - row.leftMinor : row.leftMinor - amountMinor,
  days: Math.abs(daysBetween(row.dueDate, date)),
});
const byCloseness = (a: { diff: bigint; days: number }, b: { diff: bigint; days: number }) =>
  a.diff === b.diff ? a.days - b.days : a.diff < b.diff ? -1 : 1;

type Candidate = Pick<TransactionView, "id" | "kind" | "payeeId" | "toAccountId" | "personAction" | "amountMinor" | "date" | "state" | "status" | "planItemId">;

/** The unlinked transactions that likely pay an item-month, best first (smallest amount difference, then nearest date). */
export function likelyMatches<T extends Candidate>(row: PlanRow, item: PlanItem, candidates: readonly T[]): T[] {
  if (row.status === "skipped" || row.leftMinor <= 0n) return [];
  return candidates
    .filter(
      (t) =>
        t.state === "active" &&
        t.status !== "void" &&
        t.planItemId === null &&
        paysTarget(item, t) &&
        amountNear(t.amountMinor, row.leftMinor) &&
        dateNear(t.date, row),
    )
    .map((t) => ({ t, c: closeness(t.amountMinor, t.date, row) }))
    .sort((a, b) => byCloseness(a.c, b.c) || a.t.id.localeCompare(b.t.id))
    .map((x) => x.t);
}

/**
 * Sets `likely` on each unpaid row: the best unlinked payment, each transaction offered to one row
 * only (rows in the order given), for "Looks paid — link?".
 */
export function withLikely<T extends Candidate>(rows: readonly PlanRow[], items: ReadonlyMap<string, PlanItem>, candidates: readonly T[]): PlanRow[] {
  const taken = new Set<string>();
  return rows.map((row) => {
    const item = items.get(row.itemId);
    if (!item || row.removed) return row;
    const match = likelyMatches(row, item, candidates).find((t) => !taken.has(t.id));
    if (!match) return row;
    taken.add(match.id);
    return { ...row, likely: match.id };
  });
}

/** A transaction being entered, for "Pays:" suggestions. */
export interface PayDraftShape extends PayShape {
  amountMinor: bigint;
  date: string;
}

/** The unpaid item-months a transaction being entered likely pays, best first (FR-013). */
export function paysSuggestions(draft: PayDraftShape, rows: readonly PlanRow[], items: ReadonlyMap<string, PlanItem>): PlanRow[] {
  return rows
    .filter((row) => {
      const item = items.get(row.itemId);
      return (
        !!item &&
        !row.removed &&
        row.status !== "skipped" &&
        row.leftMinor > 0n &&
        paysTarget(item, draft) &&
        amountNear(draft.amountMinor, row.leftMinor) &&
        dateNear(draft.date, row)
      );
    })
    .map((row) => ({ row, c: closeness(draft.amountMinor, draft.date, row) }))
    .sort((a, b) => byCloseness(a.c, b.c) || (a.row.month < b.row.month ? -1 : a.row.month > b.row.month ? 1 : a.row.name.localeCompare(b.row.name)))
    .map((x) => x.row);
}

/** The add-transaction form's starting values when opened from Pay (R7-10). */
export interface PayDraft {
  kind: TransactionKind;
  date: string;
  accountId: string | null;
  toAccountId: string | null;
  amountMinor: bigint;
  payeeId: string | null;
  personAction: TransactionView["personAction"];
  categoryId: string | null;
  notes: string;
  planItemId: string;
  planMonth: Month;
}

/**
 * Pay pre-fill (FR-010): what is left for the month (the planned amount when nothing is left), today,
 * the pay-from account, and the payee and category, a transfer to the card, or the person movement.
 * Anything archived or deleted since is left empty for the user to choose (edge cases).
 */
export function payDraft(
  row: PlanRow,
  item: PlanItem,
  today: string,
  live: { accounts: ReadonlySet<string>; payees: ReadonlySet<string>; categories: ReadonlySet<string> },
): PayDraft {
  const account = live.accounts.has(row.accountId) ? row.accountId : null;
  const payee = item.payeeId && live.payees.has(item.payeeId) ? item.payeeId : null;
  const base = {
    date: today,
    accountId: account,
    amountMinor: row.leftMinor > 0n ? row.leftMinor : row.plannedMinor,
    notes: `${item.name} — ${monthName(row.month)}`,
    planItemId: item.id,
    planMonth: row.month,
  };
  switch (item.target) {
    case "card":
      return {
        ...base,
        kind: "transfer",
        toAccountId: item.cardAccountId && live.accounts.has(item.cardAccountId) ? item.cardAccountId : null,
        payeeId: null,
        personAction: null,
        categoryId: null,
      };
    case "person":
      return { ...base, kind: "person", toAccountId: null, payeeId: payee, personAction: item.personAction ?? "repaid_to", categoryId: null };
    case "payee":
      return {
        ...base,
        kind: "expense",
        toAccountId: null,
        payeeId: payee,
        personAction: null,
        categoryId: item.categoryId && live.categories.has(item.categoryId) ? item.categoryId : null,
      };
  }
}
