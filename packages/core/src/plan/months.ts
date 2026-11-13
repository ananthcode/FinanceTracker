/**
 * Months, terms and due dates of plan items (research R7-01, R7-02, R7-04). Months are `yyyy-MM-01`
 * strings and compare correctly as text.
 */
import type { Month, PlanItem, PlanTerm } from "./schemas";

/** A rule the plan refuses, with the server's rejection code (contracts/sync-protocol.md). */
export class PlanRuleError extends Error {
  constructor(readonly code: "TERMS_IN_PAST" | "HAS_PAYMENTS") {
    super(code);
    this.name = "PlanRuleError";
  }
}

/** The month a `yyyy-MM-dd` date falls in. */
export const monthOf = (date: string): Month => `${date.slice(0, 7)}-01`;

const yearOf = (m: Month) => Number(m.slice(0, 4));
const monthIndexOf = (m: Month) => Number(m.slice(5, 7)) - 1;

export function addMonths(month: Month, n: number): Month {
  const total = yearOf(month) * 12 + monthIndexOf(month) + n;
  const year = Math.floor(total / 12);
  const index = total - year * 12;
  return `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}-01`;
}

/** Whole months from `from` to `to` (negative when `to` is earlier). */
export function monthsBetween(from: Month, to: Month): number {
  return yearOf(to) * 12 + monthIndexOf(to) - (yearOf(from) * 12 + monthIndexOf(from));
}

export function daysInMonth(month: Month): number {
  return new Date(Date.UTC(yearOf(month), monthIndexOf(month) + 1, 0)).getUTCDate();
}

/** Days from `a` to `b` (`yyyy-MM-dd`), negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * The deterministic id of one item in one month (R7-02): the item's uuid with its first 32 bits
 * XOR-ed with year × 12 + month index. SQL twin: app._plan_occurrence_id.
 */
export function occurrenceId(itemId: string, month: Month): string {
  const id = itemId.toLowerCase();
  const index = yearOf(month) * 12 + monthIndexOf(month);
  const head = (parseInt(id.slice(0, 8), 16) ^ index) >>> 0;
  return head.toString(16).padStart(8, "0") + id.slice(8);
}

/** Whether an item has a month (R7-04): from start to end, every `intervalMonths`; one-off once. */
export function appliesIn(item: Pick<PlanItem, "startMonth" | "endMonth" | "intervalMonths">, month: Month): boolean {
  if (month < item.startMonth) return false;
  if (item.endMonth !== null && month > item.endMonth) return false;
  if (item.intervalMonths === 0) return month === item.startMonth;
  return monthsBetween(item.startMonth, month) % item.intervalMonths === 0;
}

/** The term in force in a month: the last entry starting on or before it (the first before the start). */
export function termFor(item: Pick<PlanItem, "terms">, month: Month): PlanTerm {
  let term = item.terms[0]!;
  for (const t of item.terms) if (t.fromMonth <= month) term = t;
  return term;
}

/** The due date in a month: the term's day, or the month's last day when it is shorter (US2 6). */
export function dueDate(item: Pick<PlanItem, "terms">, month: Month): string {
  const day = Math.min(termFor(item, month).dueDay, daysInMonth(month));
  return `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export type PlanTermValues = Omit<PlanTerm, "fromMonth">;

/**
 * An edit to amount, due day or account from `from` onward (FR-008, clarify Q5): entries before it
 * stay, entries from it on are replaced by one entry. Refused before the current month.
 */
export function editTerms(terms: readonly PlanTerm[], from: Month, change: Partial<PlanTermValues>, currentMonth: Month): PlanTerm[] {
  if (from < currentMonth) throw new PlanRuleError("TERMS_IN_PAST");
  const at = from < terms[0]!.fromMonth ? terms[0]!.fromMonth : from;
  const base = termFor({ terms: [...terms] }, at);
  const kept = terms.filter((t) => t.fromMonth < at);
  return [...kept, { ...base, ...change, fromMonth: at }];
}

/** The earliest month the plan can show: the earliest item start (FR-004). */
export function earliestPlanMonth(items: readonly Pick<PlanItem, "startMonth">[], fallback: Month): Month {
  return items.reduce((min, i) => (i.startMonth < min ? i.startMonth : min), fallback);
}
