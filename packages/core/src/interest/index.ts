/**
 * Interest on person balances (R4 FR-013 – FR-016, research R4-05). The SQL twin is
 * app._propose_interest; both run test/vectors/interest.json.
 *
 * - A month's interest = round half away from zero (opening × rateE4 / 10⁶), in the balance's
 *   direction: a person who owes the user is charged (flow out), one the user owes is paid (flow in).
 * - The month's opening balance is the person's balance at the start of the month, including earlier
 *   months' proposals that are still waiting (confirmed ones already count).
 * - Months are those that have ended (their last day is before today), from the first month that
 *   starts on or after the person's opening date and has a rate.
 * - A month gets at most one proposal ever: an existing one (in any state) is never recreated; only a
 *   waiting, unedited one is recomputed (deleted when it comes to ₹0.00).
 */
import { isCounted, postingsOf } from "../transactions/postings";
import type { InterestMode, MoneyFlow, PersonRateView, TransactionView } from "../transactions/types";

/** rate × opening, rounded half away from zero to the paisa; keeps the opening's sign. */
export function interestAmount(openingMinor: bigint, rateE4: number): bigint {
  const n = openingMinor * BigInt(rateE4);
  const d = 1_000_000n;
  const q = n / d; // truncates towards zero
  const r = n % d;
  return 2n * (r < 0n ? -r : r) >= d ? q + (n < 0n ? -1n : 1n) : q;
}

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
function addMonths(first: string, n: number): string {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
/** The last day of a month given its 1st. */
export const monthEnd = (first: string) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

/** The rate in force for a month: the latest effective on or before its 1st. */
export function rateFor(month: string, rates: readonly Pick<PersonRateView, "effectiveMonth" | "rateE4">[]): number | null {
  let best: { effectiveMonth: string; rateE4: number } | null = null;
  for (const r of rates) if (r.effectiveMonth <= month && (!best || r.effectiveMonth > best.effectiveMonth)) best = r;
  return best ? best.rateE4 : null;
}

export interface InterestPerson {
  id: string;
  openingBalanceMinor: bigint;
  openingBalanceDate: string | null;
  interestMode: InterestMode;
}

type Tx = Pick<
  TransactionView,
  "id" | "kind" | "flow" | "accountId" | "toAccountId" | "amountMinor" | "payeeId" | "categoryId" | "lines" | "date" | "state" | "confirmed" | "status" | "generated" | "interestMonth" | "userEdited"
>;

export interface InterestAction {
  type: "create" | "update" | "delete";
  /** `yyyy-MM-01` */
  month: string;
  /** The existing proposal (update, delete). */
  id: string | null;
  /** Positive amount and its flow (create, update). */
  amountMinor: bigint;
  flow: MoneyFlow;
}

export interface InterestResult {
  actions: InterestAction[];
  /** Every active proposal after the actions: month → effect on the person (+ they owe more). */
  proposals: Map<string, bigint>;
}

const effectOf = (amount: bigint, flow: MoneyFlow) => (flow === "out" ? amount : -amount);

export function proposeInterest(
  person: InterestPerson,
  rates: readonly Pick<PersonRateView, "effectiveMonth" | "rateE4">[],
  transactions: readonly Tx[],
  todayIso: string,
): InterestResult {
  const result: InterestResult = { actions: [], proposals: new Map() };
  const mine = transactions.filter((t) => t.payeeId === person.id || t.lines.some((l) => l.personId === person.id));
  const generated = new Map(mine.filter((t) => t.generated && t.interestMonth).map((t) => [t.interestMonth!, t]));
  for (const [month, t] of generated) if (t.state === "active" && t.status !== "void") result.proposals.set(month, effectOf(t.amountMinor, t.flow));
  if (person.interestMode !== "automatic" || !person.openingBalanceDate || rates.length === 0) return result;

  const opening = person.openingBalanceDate;
  let month = opening.endsWith("-01") ? opening : addMonths(monthStart(opening), 1);
  const lastEnded = addMonths(monthStart(todayIso), -1);
  // Counted movements (confirmed proposals included) by date, for the balance at each month's start.
  const counted = mine
    .filter((t) => isCounted(t) && t.date >= opening)
    .map((t) => ({
      date: t.date,
      effect: postingsOf(t, () => "bank").reduce((s, p) => (p.type === "person" && p.personId === person.id ? s + p.effect : s), 0n),
    }));
  // Waiting proposals count in later months' openings with their current (recomputed) amount.
  const waiting = new Map<string, bigint>();
  for (const [m, t] of generated) {
    if (t.state === "active" && !t.confirmed && t.status !== "void") waiting.set(m, effectOf(t.amountMinor, t.flow));
  }

  for (; month <= lastEnded; month = addMonths(month, 1)) {
    let balance = person.openingBalanceMinor;
    for (const c of counted) if (c.date < month) balance += c.effect;
    for (const [m, e] of waiting) if (m < month) balance += e;
    const rate = rateFor(month, rates);
    if (rate === null) continue;
    const amount = interestAmount(balance, rate);
    const flow: MoneyFlow = amount < 0n ? "in" : "out";
    const abs = amount < 0n ? -amount : amount;
    const existing = generated.get(month);
    if (!existing) {
      if (abs === 0n) continue;
      result.actions.push({ type: "create", month, id: null, amountMinor: abs, flow });
      waiting.set(month, amount);
      result.proposals.set(month, amount);
    } else if (existing.state === "active" && !existing.confirmed && !existing.userEdited && existing.status !== "void") {
      if (abs === 0n) {
        result.actions.push({ type: "delete", month, id: existing.id, amountMinor: 0n, flow });
        waiting.delete(month);
        result.proposals.delete(month);
      } else if (effectOf(existing.amountMinor, existing.flow) !== amount) {
        result.actions.push({ type: "update", month, id: existing.id, amountMinor: abs, flow });
        waiting.set(month, amount);
        result.proposals.set(month, amount);
      }
    }
  }
  return result;
}
