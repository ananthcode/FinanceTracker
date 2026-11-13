/**
 * Reports (R6): periods, the spending / income drill-down tree, the month trend and safe to spend.
 * Pure functions over totals the database computes from R4's postings, so web and Android show the
 * same numbers and every level adds up exactly to the one above (SC-002).
 */
import { isOwedType, type AccountType } from "../accounts/types";
import { fiscalYearOf } from "../dates";
import type { CategoryView } from "../categories/types";
import { isCounted, postingsOf } from "../transactions/postings";
import type { TransactionView } from "../transactions/types";

// ---------------------------------------------------------------- periods

export const PERIOD_PRESETS = ["this_month", "last_month", "this_fy", "last_12_months", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  from: string;
  to: string;
}

const monthStartOf = (iso: string) => `${iso.slice(0, 7)}-01`;
function addMonths(first: string, n: number): string {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
/** The last day of the month that `iso` falls in. */
export function monthEndOf(iso: string): string {
  const d = new Date(`${monthStartOf(iso)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** The dates of the financial year containing `iso` (India: April–March by default; see fiscalYearOf). */
export function financialYearPeriod(iso: string, fyStartMonth = 4): Period {
  const { startYear } = fiscalYearOf(iso, fyStartMonth);
  const from = `${startYear}-${String(fyStartMonth).padStart(2, "0")}-01`;
  return { from, to: monthEndOf(addMonths(from, 11)) };
}

/** The dates a preset covers on `todayIso` (custom: the given dates). */
export function periodOf(preset: PeriodPreset, todayIso: string, fyStartMonth = 4, custom?: Period): Period {
  const thisMonth = monthStartOf(todayIso);
  switch (preset) {
    case "this_month":
      return { from: thisMonth, to: monthEndOf(thisMonth) };
    case "last_month": {
      const last = addMonths(thisMonth, -1);
      return { from: last, to: monthEndOf(last) };
    }
    case "this_fy":
      return financialYearPeriod(todayIso, fyStartMonth);
    case "last_12_months":
      return { from: addMonths(thisMonth, -11), to: monthEndOf(thisMonth) };
    case "custom":
      return custom ?? { from: thisMonth, to: monthEndOf(thisMonth) };
  }
}

/** The 1st of every month from `from` to `to`. */
export function monthsOf(period: Period): string[] {
  const months: string[] = [];
  for (let m = monthStartOf(period.from); m <= period.to; m = addMonths(m, 1)) months.push(m);
  return months;
}

// ---------------------------------------------------------------- the drill-down tree

/** One total from the database: counted category postings of a kind, category and payee in a period. */
export interface TotalRow {
  kind: "expense" | "income";
  categoryId: string | null;
  payeeId: string | null;
  totalMinor: bigint;
}

export const UNCATEGORISED_ID = "uncategorised";
export const NO_PAYEE_ID = "none";

export interface PayeeTotal {
  /** A payee id or "none". */
  id: string;
  totalMinor: bigint;
}

export interface ReportNode {
  /** A category id or "uncategorised". */
  id: string;
  name: string;
  /** Recorded on the category itself (not its sub-categories). */
  ownMinor: bigint;
  /** Own plus every sub-category's. */
  totalMinor: bigint;
  children: ReportNode[];
  /** Who the category's own amount was with; adds up to `ownMinor`. */
  payees: PayeeTotal[];
}

export interface ReportTree {
  kind: "expense" | "income";
  totalMinor: bigint;
  /** Top-level categories (and Uncategorised), largest first. */
  nodes: ReportNode[];
  /** Every node by id, for drilling in. */
  byId: Map<string, ReportNode>;
}

const byTotal = (a: { totalMinor: bigint }, b: { totalMinor: bigint }) =>
  a.totalMinor === b.totalMinor ? 0 : a.totalMinor > b.totalMinor ? -1 : 1;

/**
 * Builds the drill-down for one kind: category → sub-category → payee. Categories unknown to the list
 * (none in normal use) appear as top-level nodes named "Deleted category". Nodes with no total are
 * left out.
 */
export function categoryTree(
  rows: readonly TotalRow[],
  kind: "expense" | "income",
  categories: readonly Pick<CategoryView, "id" | "name" | "parentId">[],
): ReportTree {
  const known = new Map(categories.map((c) => [c.id, c]));
  const nodes = new Map<string, ReportNode>();
  const payees = new Map<string, Map<string, bigint>>();
  const node = (id: string): ReportNode => {
    let n = nodes.get(id);
    if (!n) {
      const name = id === UNCATEGORISED_ID ? "Uncategorised" : (known.get(id)?.name ?? "Deleted category");
      n = { id, name, ownMinor: 0n, totalMinor: 0n, children: [], payees: [] };
      nodes.set(id, n);
    }
    return n;
  };
  const parentOf = (id: string) => (id === UNCATEGORISED_ID ? null : (known.get(id)?.parentId ?? null));

  for (const r of rows) {
    if (r.kind !== kind || r.totalMinor === 0n) continue;
    const id = r.categoryId ?? UNCATEGORISED_ID;
    const n = node(id);
    n.ownMinor += r.totalMinor;
    const p = payees.get(id) ?? new Map<string, bigint>();
    const payee = r.payeeId ?? NO_PAYEE_ID;
    p.set(payee, (p.get(payee) ?? 0n) + r.totalMinor);
    payees.set(id, p);
    // Make every ancestor exist and carry the amount in its total.
    const seen = new Set([id]);
    n.totalMinor += r.totalMinor;
    for (let parent = parentOf(id); parent && !seen.has(parent); parent = parentOf(parent)) {
      seen.add(parent);
      node(parent).totalMinor += r.totalMinor;
    }
  }

  const top: ReportNode[] = [];
  for (const n of nodes.values()) {
    n.payees = [...(payees.get(n.id) ?? new Map<string, bigint>())]
      .filter(([, total]) => total !== 0n)
      .map(([id, totalMinor]) => ({ id, totalMinor }))
      .sort(byTotal);
    const parent = parentOf(n.id);
    if (parent && nodes.has(parent)) nodes.get(parent)!.children.push(n);
    else top.push(n);
  }
  for (const n of nodes.values()) n.children = n.children.filter((c) => c.totalMinor !== 0n || c.ownMinor !== 0n).sort(byTotal);
  const shown = top.filter((n) => n.totalMinor !== 0n || n.ownMinor !== 0n).sort(byTotal);
  return { kind, totalMinor: shown.reduce((s, n) => s + n.totalMinor, 0n), nodes: shown, byId: nodes };
}

// ---------------------------------------------------------------- the month trend

export interface MonthTotalRow {
  /** `yyyy-MM-01` */
  month: string;
  incomeMinor: bigint;
  spendingMinor: bigint;
}

export interface TrendMonth extends MonthTotalRow {
  netMinor: bigint;
}

/** Every month of the period in order, missing months as zero, with income − spending. */
export function monthlyTrend(rows: readonly MonthTotalRow[], period: Period): TrendMonth[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthsOf(period).map((month) => {
    const r = byMonth.get(month);
    const incomeMinor = r?.incomeMinor ?? 0n;
    const spendingMinor = r?.spendingMinor ?? 0n;
    return { month, incomeMinor, spendingMinor, netMinor: incomeMinor - spendingMinor };
  });
}

// ---------------------------------------------------------------- safe to spend

export interface SafeToSpend {
  /** Held accounts (bank, cash, wallet) counted in net worth. */
  heldMinor: bigint;
  /** Owed on credit cards counted in net worth. */
  cardOwedMinor: bigint;
  /** Not-yet-confirmed outgoings dated up to the end of this month. */
  upcomingMinor: bigint;
  bufferMinor: bigint;
  /** Never below zero. */
  resultMinor: bigint;
  /** How far below zero it would be (0 when it is not). */
  shortfallMinor: bigint;
}

type Upcoming = Pick<TransactionView, "kind" | "flow" | "accountId" | "amountMinor" | "date" | "state" | "confirmed" | "status">;

/**
 * Safe to spend (clarify Q1, 2026-11-01): held − card owed − upcoming outgoings − buffer.
 * `held` / `cardOwed` are the accounts summary's owned and owed without people. Upcoming outgoings:
 * transactions not yet confirmed, not void, dated up to `monthEnd`, that take money out of an account
 * counted in net worth (expenses; person movements out). Transfers and income are skipped.
 */
export function safeToSpend(input: {
  heldMinor: bigint;
  cardOwedMinor: bigint;
  upcoming: readonly Upcoming[];
  /** Accounts counted in net worth (held or card). */
  countedAccountIds: ReadonlySet<string>;
  monthEnd: string;
  bufferMinor: bigint;
}): SafeToSpend {
  let upcomingMinor = 0n;
  for (const t of input.upcoming) {
    if (t.state !== "active" || t.confirmed || t.status === "void" || t.date > input.monthEnd) continue;
    if (!t.accountId || !input.countedAccountIds.has(t.accountId)) continue;
    const outgoing = t.kind === "expense" || (t.kind === "person" && t.flow === "out");
    if (outgoing) upcomingMinor += t.amountMinor;
  }
  const raw = input.heldMinor - input.cardOwedMinor - upcomingMinor - input.bufferMinor;
  return {
    heldMinor: input.heldMinor,
    cardOwedMinor: input.cardOwedMinor,
    upcomingMinor,
    bufferMinor: input.bufferMinor,
    resultMinor: raw > 0n ? raw : 0n,
    shortfallMinor: raw < 0n ? -raw : 0n,
  };
}

/** Accounts counted in net worth, for `safeToSpend` (as the accounts summary counts them). */
export function countedAccounts(
  rows: readonly { account: { id: string; type: AccountType; state: string }; balance: bigint; excluded: boolean }[],
): { ids: Set<string>; heldMinor: bigint; cardOwedMinor: bigint } {
  const ids = new Set<string>();
  let heldMinor = 0n;
  let cardOwedMinor = 0n;
  for (const r of rows) {
    const counted = !r.excluded && (r.account.state === "active" || (r.account.state === "archived" && r.balance !== 0n));
    if (!counted) continue;
    ids.add(r.account.id);
    if (isOwedType(r.account.type)) cardOwedMinor += r.balance;
    else heldMinor += r.balance;
  }
  return { ids, heldMinor, cardOwedMinor };
}

// ---------------------------------------------------------------- core twins of the database readers

type Reported = Pick<
  TransactionView,
  "kind" | "flow" | "accountId" | "toAccountId" | "amountMinor" | "payeeId" | "categoryId" | "lines" | "date" | "state" | "confirmed" | "status"
>;

const inPeriod = (t: Pick<TransactionView, "date">, period: Period) => t.date >= period.from && t.date <= period.to;

/** The totals `app.category_payee_totals` returns, from transactions (parity tests, Android). */
export function categoryPayeeTotals(transactions: readonly Reported[], period: Period): TotalRow[] {
  const sums = new Map<string, TotalRow>();
  for (const t of transactions) {
    if (!isCounted(t) || !inPeriod(t, period)) continue;
    for (const p of postingsOf(t, () => "bank")) {
      if (p.type !== "category") continue;
      const key = `${p.kind}|${p.categoryId ?? ""}|${t.payeeId ?? ""}`;
      const row = sums.get(key) ?? { kind: p.kind, categoryId: p.categoryId, payeeId: t.payeeId, totalMinor: 0n };
      row.totalMinor += p.effect;
      sums.set(key, row);
    }
  }
  return [...sums.values()].filter((r) => r.totalMinor !== 0n);
}

/**
 * How much of one counted transaction falls on a category itself (not its sub-categories) for a kind:
 * the report's payee level lists each transaction with this amount, so a split one shows only its
 * line(s) in the category and the list adds up to the payee's total. `categoryId` null = Uncategorised.
 */
export function categoryShareOf(t: Reported, kind: "expense" | "income", categoryId: string | null): bigint {
  if (!isCounted(t)) return 0n;
  let share = 0n;
  for (const p of postingsOf(t, () => "bank")) {
    if (p.type === "category" && p.kind === kind && p.categoryId === categoryId) share += p.effect;
  }
  return share;
}

/** The totals `app.month_totals` returns, from transactions. */
export function monthTotalsOf(transactions: readonly Reported[], period: Period): MonthTotalRow[] {
  const months = new Map<string, MonthTotalRow>();
  for (const t of transactions) {
    if (!isCounted(t) || !inPeriod(t, period)) continue;
    const month = monthStartOf(t.date);
    const row = months.get(month) ?? { month, incomeMinor: 0n, spendingMinor: 0n };
    for (const p of postingsOf(t, () => "bank")) {
      if (p.type !== "category") continue;
      if (p.kind === "income") row.incomeMinor += p.effect;
      else row.spendingMinor += p.effect;
    }
    months.set(month, row);
  }
  return [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}
