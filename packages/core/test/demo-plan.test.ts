import { describe, expect, it } from "vitest";
import {
  addMonths,
  appliesIn,
  canPayPlan,
  currentBalance,
  demoAccounts,
  demoLists,
  demoPlan,
  demoTransactions,
  isCountedLink,
  movementsOf,
  PlanItemCreateFields,
  planMonth,
  termsToWire,
  type LinkedTransaction,
  type PlanAccount,
} from "../src";

/** R7 T017 — the demo household's plan (research R7-11, FR-019). */
const TODAY = "2026-11-13";
const { transactions } = demoTransactions(TODAY);
const plan = demoPlan(TODAY, transactions);

function view(month: string) {
  const { accounts } = demoAccounts();
  const movements = movementsOf(transactions, (id) => accounts.find((a) => a.id === id)?.type ?? "bank");
  const planAccounts: PlanAccount[] = accounts.map((a) => ({
    id: a.id,
    type: a.type,
    balanceMinor: currentBalance(a, movements),
    creditLimitMinor: a.creditLimitMinor,
    state: a.state,
  }));
  const links: LinkedTransaction[] = transactions
    .filter((t) => plan.links.has(t.id))
    .map((t) => ({ id: t.id, ...plan.links.get(t.id)!, amountMinor: t.amountMinor, date: t.date, state: t.state, confirmed: t.confirmed, status: t.status }));
  return planMonth({ month, today: TODAY, items: plan.items, occurrences: plan.occurrences, links, accounts: planAccounts });
}

describe("demoPlan", () => {
  it("is the same every time for the same day", () => {
    expect(demoPlan(TODAY, transactions)).toEqual(demoPlan(TODAY, transactions));
  });

  it("has every kind of item, valid on the wire", () => {
    const { payees } = demoLists();
    for (const i of plan.items) {
      const { id, state, ...fields } = i;
      void id;
      void state;
      const parsed = PlanItemCreateFields.safeParse({ ...fields, terms: termsToWire(i.terms) });
      expect(parsed.success, `${i.name}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true);
      if (i.target === "payee") expect(payees.find((p) => p.id === i.payeeId)?.kind, i.name).toBe("business");
      if (i.target === "person") expect(payees.find((p) => p.id === i.payeeId)?.kind, i.name).toBe("person");
    }
    expect(new Set(plan.items.map((i) => i.frequency))).toEqual(new Set(["monthly", "every_n_months", "yearly"]));
    expect(new Set(plan.items.map((i) => i.target))).toEqual(new Set(["payee", "card", "person"]));
    expect(plan.items.some((i) => i.amountVaries)).toBe(true);
  });

  it("links only transactions that can pay, to months their items have", () => {
    const items = new Map(plan.items.map((i) => [i.id, i]));
    for (const t of transactions) {
      const link = plan.links.get(t.id);
      if (!link) continue;
      expect(canPayPlan(t.kind, t.personAction), t.id).toBe(true);
      expect(appliesIn(items.get(link.planItemId)!, link.planMonth), `${t.id} ${link.planMonth}`).toBe(true);
    }
  });

  it("this month: last month's electricity is the one overdue item carried in, and the totals add up", () => {
    const v = view("2026-11-01");
    expect(v.carried.map((r) => `${r.name} ${r.month}`)).toEqual(["Electricity 2026-10-01"]);
    expect(v.carried[0]!.status).toBe("overdue");
    expect(v.totals.plannedMinor).toBe(v.totals.paidMinor + v.totals.leftMinor - v.totals.overpaidMinor);
    expect(v.rows.find((r) => r.name === "Rent")!.status).toBe("paid");
    expect(v.rows.find((r) => r.name === "School fees")!.upcomingMinor).toBeGreaterThan(0n);
  });

  it("every earlier month is paid except that electricity bill", () => {
    for (let m = "2025-04-01"; m < "2026-11-01"; m = addMonths(m, 1)) {
      const unpaid = view(m).rows.filter((r) => r.leftMinor > 0n).map((r) => r.name);
      expect(unpaid, m).toEqual(m === "2026-10-01" ? ["Electricity"] : []);
    }
  });

  it("next month: rent already linked as upcoming, the subscription skipped, the car loan starting", () => {
    const v = view("2026-12-01");
    expect(v.rows.find((r) => r.name === "Rent")!.upcomingMinor).toBe(2_500_000n);
    expect(v.rows.find((r) => r.name === "Stream Plus")!.status).toBe("skipped");
    expect(v.rows.some((r) => r.name === "Car loan EMI")).toBe(true);
    expect(v.rows.filter((r) => r.estimated).map((r) => r.name).sort()).toEqual(["Electricity", "Rewards Card bill"]);
  });

  it("counts a link only when it is counted", () => {
    const linked = transactions.filter((t) => plan.links.has(t.id));
    expect(linked.some((t) => !t.confirmed)).toBe(true);
    expect(linked.filter((t) => isCountedLink(t)).length).toBeGreaterThan(40);
  });
});
