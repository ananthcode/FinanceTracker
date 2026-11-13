/**
 * One month of the plan (research R7-05, R7-06): planned amounts and estimates, statuses, totals,
 * overdue carry-forward counted once, cash by account and the comparison with last month. Pure:
 * web and Android pass the same inputs and get the same numbers (constitution VII).
 */
import type { AccountType } from "../accounts/types";
import { addMonths, appliesIn, daysBetween, dueDate, monthOf, termFor } from "./months";
import type { LinkedTransaction, Month, PlanItem, PlanOccurrence, PlanTarget } from "./schemas";

export type PlanStatus = "paid" | "part_paid" | "due" | "due_today" | "overdue" | "skipped";

export interface PlanAccount {
  id: string;
  type: AccountType;
  /** Held amount, or for a credit card the amount owed (R2 sign convention). */
  balanceMinor: bigint;
  creditLimitMinor: bigint | null;
  state: string;
}

export interface PlanLink {
  id: string;
  amountMinor: bigint;
  date: string;
  /** False: an upcoming payment linked, not paid yet (R7-03). */
  counted: boolean;
}

export interface PlanRow {
  itemId: string;
  month: Month;
  name: string;
  target: PlanTarget;
  accountId: string;
  dueDate: string;
  plannedMinor: bigint;
  estimated: boolean;
  /** No amount anywhere: shown as "Amount not set". */
  notSet: boolean;
  paidMinor: bigint;
  leftMinor: bigint;
  overpaidMinor: bigint;
  /** Linked payments not confirmed yet. */
  upcomingMinor: bigint;
  status: PlanStatus;
  daysLate: number | null;
  links: PlanLink[];
  /** A likely unlinked payment ("Looks paid — link?"), set by the screen from match.ts. */
  likely: string | null;
  previousPaidMinor: bigint;
  /** The item was deleted; its paid month is kept (FR-008). */
  removed: boolean;
}

export interface PlanTotals {
  plannedMinor: bigint;
  paidMinor: bigint;
  leftMinor: bigint;
  overpaidMinor: bigint;
}

export interface CashRow {
  accountId: string;
  leftMinor: bigint;
  /** Balance, or a card's credit still available; null for a card without a limit. */
  availableMinor: bigint | null;
  shortMinor: bigint;
}

export interface PlanMonthView {
  month: Month;
  currentMonth: Month;
  rows: PlanRow[];
  /** Unpaid months before this one (and before the current month), oldest first (FR-014). */
  carried: PlanRow[];
  totals: PlanTotals;
  /** Carried-over rows count in these totals only in the current month. */
  countedHere: boolean;
  cash: CashRow[];
  previous: { month: Month; plannedMinor: bigint; paidMinor: bigint; differenceMinor: bigint; direction: "more" | "less" | "same" };
  estimatedCount: number;
}

export const isCountedLink = (t: Pick<LinkedTransaction, "state" | "confirmed" | "status">) =>
  t.state === "active" && t.confirmed && t.status !== "void";
export const isUpcomingLink = (t: Pick<LinkedTransaction, "state" | "confirmed" | "status">) =>
  t.state === "active" && !t.confirmed && t.status !== "void";

/** Whether an item's amount is estimated when no month amount is set (R7-05). */
export const isVarying = (item: PlanItem, month: Month) => item.amountVaries || termFor(item, month).amountMinor === null;

/**
 * The planned amount of one item-month (R7-05, clarify Q3):
 * 1. the amount set for the month;
 * 2. the usual amount, unless the amount varies;
 * 3. when it varies: a card bill in the current or coming month → the card's amount owed now plus what
 *    is already paid; something paid → the paid amount ("as paid"); last month's paid amount; the usual
 *    amount; else 0 ("Amount not set").
 */
export function plannedFor(input: {
  item: PlanItem;
  month: Month;
  occurrence?: Pick<PlanOccurrence, "amountMinor"> | null;
  paidMinor: bigint;
  previousPaidMinor: bigint;
  /** The card's amount owed now (card bills only). */
  cardOwedMinor?: bigint | null;
  currentMonth: Month;
}): { plannedMinor: bigint; estimated: boolean; notSet: boolean } {
  const { item, month } = input;
  if (input.occurrence && input.occurrence.amountMinor !== null) {
    return { plannedMinor: input.occurrence.amountMinor, estimated: false, notSet: false };
  }
  const usual = termFor(item, month).amountMinor;
  if (!isVarying(item, month) && usual !== null) return { plannedMinor: usual, estimated: false, notSet: false };

  const soon = month === input.currentMonth || month === addMonths(input.currentMonth, 1);
  if (item.target === "card" && soon && input.cardOwedMinor !== undefined && input.cardOwedMinor !== null) {
    const owed = input.cardOwedMinor > 0n ? input.cardOwedMinor : 0n;
    return { plannedMinor: owed + input.paidMinor, estimated: true, notSet: false };
  }
  if (input.paidMinor > 0n) return { plannedMinor: input.paidMinor, estimated: false, notSet: false };
  if (input.previousPaidMinor > 0n) return { plannedMinor: input.previousPaidMinor, estimated: true, notSet: false };
  if (usual !== null) return { plannedMinor: usual, estimated: true, notSet: false };
  return { plannedMinor: 0n, estimated: false, notSet: true };
}

/** Status in words (FR-002). An overdue row with something paid is also part paid. */
export function statusOf(input: {
  plannedMinor: bigint;
  paidMinor: bigint;
  notSet: boolean;
  skipped: boolean;
  dueDate: string;
  today: string;
}): { status: PlanStatus; daysLate: number | null } {
  if (input.skipped) return { status: "skipped", daysLate: null };
  if (!input.notSet && input.paidMinor >= input.plannedMinor) return { status: "paid", daysLate: null };
  if (input.today > input.dueDate) return { status: "overdue", daysLate: daysBetween(input.dueDate, input.today) };
  if (input.paidMinor > 0n) return { status: "part_paid", daysLate: null };
  if (input.today === input.dueDate) return { status: "due_today", daysLate: null };
  return { status: "due", daysLate: null };
}

const key = (itemId: string, month: Month) => `${itemId}|${month}`;

export interface PlanInput {
  month: Month;
  /** Today in the user's timezone (`yyyy-MM-dd`). */
  today: string;
  items: readonly PlanItem[];
  occurrences: readonly PlanOccurrence[];
  /** Every linked transaction up to the month shown (narrow columns). */
  links: readonly LinkedTransaction[];
  accounts: readonly PlanAccount[];
}

/** Everything one month of the plan shows (contracts/client-plan.md). */
export function planMonth(input: PlanInput): PlanMonthView {
  const currentMonth = monthOf(input.today);
  const occurrences = new Map(input.occurrences.map((o) => [key(o.itemId, o.month), o]));
  const linked = new Map<string, LinkedTransaction[]>();
  for (const t of input.links) {
    if (t.state !== "active") continue;
    const k = key(t.planItemId, t.planMonth);
    linked.set(k, [...(linked.get(k) ?? []), t]);
  }
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const paidOf = (itemId: string, month: Month) =>
    (linked.get(key(itemId, month)) ?? []).filter(isCountedLink).reduce((s, t) => s + t.amountMinor, 0n);
  const hasLinks = (itemId: string, month: Month) =>
    (linked.get(key(itemId, month)) ?? []).some((t) => t.status !== "void");

  const rowFor = (item: PlanItem, month: Month): PlanRow => {
    const links = (linked.get(key(item.id, month)) ?? []).filter((t) => t.status !== "void");
    const paidMinor = links.filter(isCountedLink).reduce((s, t) => s + t.amountMinor, 0n);
    const upcomingMinor = links.filter(isUpcomingLink).reduce((s, t) => s + t.amountMinor, 0n);
    const previousPaidMinor = paidOf(item.id, addMonths(month, -1));
    const occurrence = occurrences.get(key(item.id, month)) ?? null;
    const card = item.cardAccountId ? accounts.get(item.cardAccountId) : undefined;
    // A removed item's paid month, or a linked month the item no longer has, is shown as paid
    // (FR-008, R7-03): nothing more is planned there.
    const asPaid = item.state === "deleted" || !appliesIn(item, month);
    const planned = asPaid
      ? { plannedMinor: paidMinor, estimated: false, notSet: false }
      : plannedFor({
          item,
          month,
          occurrence,
          paidMinor,
          previousPaidMinor,
          cardOwedMinor: item.target === "card" && card ? card.balanceMinor : null,
          currentMonth,
        });
    const skipped = occurrence?.skipped === true;
    const due = dueDate(item, month);
    const { status, daysLate } = statusOf({ ...planned, paidMinor, skipped, dueDate: due, today: input.today });
    const counts = !skipped;
    return {
      itemId: item.id,
      month,
      name: item.name,
      target: item.target,
      accountId: termFor(item, month).accountId,
      dueDate: due,
      ...planned,
      paidMinor,
      leftMinor: counts && planned.plannedMinor > paidMinor ? planned.plannedMinor - paidMinor : 0n,
      overpaidMinor: counts && paidMinor > planned.plannedMinor ? paidMinor - planned.plannedMinor : 0n,
      upcomingMinor,
      status,
      daysLate,
      links: links
        .map((t) => ({ id: t.id, amountMinor: t.amountMinor, date: t.date, counted: isCountedLink(t) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
      likely: null,
      previousPaidMinor,
      removed: item.state === "deleted",
    };
  };

  const rowsOf = (month: Month): PlanRow[] =>
    input.items
      .filter((i) => (i.state === "active" && appliesIn(i, month)) || hasLinks(i.id, month))
      .map((i) => rowFor(i, month))
      .sort((a, b) => (a.dueDate === b.dueDate ? a.name.localeCompare(b.name) : a.dueDate < b.dueDate ? -1 : 1));

  const rows = rowsOf(input.month);

  // Carry-forward (FR-014): months that ended unpaid, before this one. A card bill estimated from the
  // card's amount owed is not carried: what was left unpaid is already in what the card owes now.
  const carried: PlanRow[] = [];
  const limit = input.month < currentMonth ? input.month : currentMonth;
  for (const item of input.items) {
    if (item.state !== "active") continue;
    const cardEstimated = item.target === "card" && isVarying(item, currentMonth);
    if (cardEstimated) continue;
    for (let m = item.startMonth; m < limit && (item.endMonth === null || m <= item.endMonth); m = addMonths(m, 1)) {
      if (!appliesIn(item, m) && !hasLinks(item.id, m)) continue;
      const row = rowFor(item, m);
      if (row.status !== "skipped" && row.leftMinor > 0n) carried.push(row);
    }
  }
  carried.sort((a, b) => (a.dueDate === b.dueDate ? a.name.localeCompare(b.name) : a.dueDate < b.dueDate ? -1 : 1));

  const countedHere = input.month === currentMonth;
  const totalsOf = (list: readonly PlanRow[]): PlanTotals => {
    const t: PlanTotals = { plannedMinor: 0n, paidMinor: 0n, leftMinor: 0n, overpaidMinor: 0n };
    for (const r of list) {
      if (r.status === "skipped") continue;
      t.plannedMinor += r.plannedMinor;
      t.paidMinor += r.paidMinor;
      t.leftMinor += r.leftMinor;
      t.overpaidMinor += r.overpaidMinor;
    }
    return t;
  };
  const totals = totalsOf(countedHere ? [...rows, ...carried] : rows);

  // Cash needed by account (FR-015), for the current month.
  const cash: CashRow[] = [];
  if (countedHere) {
    const left = new Map<string, bigint>();
    for (const r of [...rows, ...carried]) {
      if (r.leftMinor > 0n) left.set(r.accountId, (left.get(r.accountId) ?? 0n) + r.leftMinor);
    }
    for (const [accountId, leftMinor] of left) {
      const a = accounts.get(accountId);
      let availableMinor: bigint | null = null;
      if (a && a.type === "credit_card") {
        availableMinor = a.creditLimitMinor === null ? null : a.creditLimitMinor - a.balanceMinor > 0n ? a.creditLimitMinor - a.balanceMinor : 0n;
      } else if (a) {
        availableMinor = a.balanceMinor;
      }
      const shortMinor = availableMinor !== null && leftMinor > availableMinor ? leftMinor - availableMinor : 0n;
      cash.push({ accountId, leftMinor, availableMinor, shortMinor });
    }
    cash.sort((a, b) => (a.leftMinor === b.leftMinor ? a.accountId.localeCompare(b.accountId) : a.leftMinor > b.leftMinor ? -1 : 1));
  }

  // Compared with last month (FR-016): this month's own items, carried ones left out on both sides.
  const previousMonth = addMonths(input.month, -1);
  const before = totalsOf(rowsOf(previousMonth));
  const now = totalsOf(rows);
  const diff = now.plannedMinor - before.plannedMinor;

  return {
    month: input.month,
    currentMonth,
    rows,
    carried,
    totals,
    countedHere,
    cash,
    previous: {
      month: previousMonth,
      plannedMinor: before.plannedMinor,
      paidMinor: before.paidMinor,
      differenceMinor: diff < 0n ? -diff : diff,
      direction: diff > 0n ? "more" : diff < 0n ? "less" : "same",
    },
    estimatedCount: rows.filter((r) => r.estimated && r.status !== "skipped").length,
  };
}
