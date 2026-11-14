import { occurrenceId, type LinkedTransaction, type PlanAccount, type PlanItem, type PlanOccurrence, type PlanTerm } from "../src";
import vectors from "./vectors/plan.json";

/** The plan vectors' household (test/vectors/plan.json) as core values, for the matching and nudge tests. */

type RawTerm = { fromMonth: string; amountMinor: string | null; dueDay: number; accountId: string };
export const term = (t: RawTerm): PlanTerm => ({ ...t, amountMinor: t.amountMinor === null ? null : BigInt(t.amountMinor) });

function item(raw: Record<string, unknown>): PlanItem {
  return {
    id: raw.id as string,
    name: raw.name as string,
    target: raw.target as PlanItem["target"],
    payeeId: (raw.payeeId as string) ?? null,
    categoryId: null,
    cardAccountId: (raw.cardAccountId as string) ?? null,
    personAction: null,
    frequency: raw.frequency as PlanItem["frequency"],
    intervalMonths: raw.intervalMonths as number,
    startMonth: raw.startMonth as string,
    endMonth: (raw.endMonth as string | null) ?? null,
    amountVaries: raw.amountVaries as boolean,
    terms: (raw.terms as RawTerm[]).map(term),
    notes: null,
    state: (raw.state as PlanItem["state"]) ?? "active",
  };
}

const h = vectors.household;
export const today = h.today;
export const accounts: PlanAccount[] = h.accounts.map((a) => ({
  ...a,
  type: a.type as PlanAccount["type"],
  balanceMinor: BigInt(a.balanceMinor),
  creditLimitMinor: a.creditLimitMinor === null ? null : BigInt(a.creditLimitMinor),
}));
export const items = h.items.map((i) => item(i as Record<string, unknown>));
export const occurrences: PlanOccurrence[] = h.occurrences.map((o) => ({
  id: occurrenceId("00000000-0000-4000-8000-000000000000", o.month),
  itemId: o.itemId,
  month: o.month,
  amountMinor: o.amountMinor === null ? null : BigInt(o.amountMinor),
  skipped: o.skipped,
}));
export const links: LinkedTransaction[] = h.links.map((l) => {
  const raw = l as Record<string, unknown>;
  return {
    id: l.id,
    planItemId: l.planItemId,
    planMonth: l.planMonth,
    amountMinor: BigInt(l.amountMinor),
    date: l.date,
    state: (raw.state as LinkedTransaction["state"]) ?? "active",
    confirmed: (raw.confirmed as boolean) ?? true,
    status: (raw.status as LinkedTransaction["status"]) ?? "cleared",
  };
});
export const termsVector = vectors.terms.terms.map(term);
