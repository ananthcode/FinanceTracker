import { describe, expect, it } from "vitest";
import {
  categoryPayeeTotals,
  categoryShareOf,
  categoryTree,
  NO_PAYEE_ID,
  UNCATEGORISED_ID,
  countedAccounts,
  financialYearPeriod,
  monthlyTrend,
  monthTotalsOf,
  periodOf,
  safeToSpend,
  type ReportNode,
  type TransactionView,
} from "../src";
import { toTransaction } from "./postings.test";
import vectors from "./vectors/reports.json";

/** R6 T004 — the drill-down tree, month totals, periods and safe to spend (FR-002, FR-005 – FR-007; SC-002). */
type VectorTx = Parameters<typeof toTransaction>[0];
const transactions: TransactionView[] = (vectors.transactions as VectorTx[]).map(toTransaction);
const expected = vectors.expect as unknown as {
  expense: { totalMinor: string; nodes: Record<string, { ownMinor: string; totalMinor: string; payees: Record<string, string> }>; top: string[] };
  income: { totalMinor: string; nodes: Record<string, { ownMinor: string; totalMinor: string; payees: Record<string, string> }>; top: string[] };
  monthsPeriod: { from: string; to: string };
  months: { month: string; incomeMinor: string; spendingMinor: string }[];
};

function check(kind: "expense" | "income") {
  const tree = categoryTree(categoryPayeeTotals(transactions, vectors.period), kind, vectors.categories);
  const want = expected[kind];
  expect(tree.totalMinor.toString()).toBe(want.totalMinor);
  expect(tree.nodes.map((n) => n.id)).toEqual(want.top);
  for (const [id, w] of Object.entries(want.nodes)) {
    const n = tree.byId.get(id)!;
    expect({ own: n.ownMinor.toString(), total: n.totalMinor.toString() }, id).toEqual({ own: w.ownMinor, total: w.totalMinor });
    expect(Object.fromEntries(n.payees.map((p) => [p.id, p.totalMinor.toString()])), id).toEqual(w.payees);
  }
  // SC-002: every level adds up exactly to the one above.
  const adds = (n: ReportNode): void => {
    expect(n.ownMinor + n.children.reduce((s, c) => s + c.totalMinor, 0n), n.id).toBe(n.totalMinor);
    expect(n.payees.reduce((s, p) => s + p.totalMinor, 0n), n.id).toBe(n.ownMinor);
    n.children.forEach(adds);
  };
  tree.nodes.forEach(adds);
  expect(tree.nodes.reduce((s, n) => s + n.totalMinor, 0n)).toBe(tree.totalMinor);
}

describe("reports vectors", () => {
  it("spending drills category → sub-category → payee, adding up at every level", () => check("expense"));
  it("income drills the same way", () => check("income"));
  it("month totals: income and spending per month, refunds reducing spending", () => {
    const rows = monthTotalsOf(transactions, expected.monthsPeriod);
    const trend = monthlyTrend(rows, expected.monthsPeriod);
    expect(trend.map((m) => ({ month: m.month, incomeMinor: m.incomeMinor.toString(), spendingMinor: m.spendingMinor.toString() }))).toEqual(expected.months);
    expect(trend[1]!.netMinor).toBe(95000n - 2950n);
  });
  it("each payee's transactions, by their share in the category, add up to the payee's total (US2 4)", () => {
    for (const kind of ["expense", "income"] as const) {
      const tree = categoryTree(categoryPayeeTotals(transactions, vectors.period), kind, vectors.categories);
      for (const n of tree.byId.values()) {
        const categoryId = n.id === UNCATEGORISED_ID ? null : n.id;
        for (const p of n.payees) {
          const listed = transactions.filter(
            (t) => t.date >= vectors.period.from && t.date <= vectors.period.to && (t.payeeId ?? NO_PAYEE_ID) === p.id,
          );
          const sum = listed.reduce((s, t) => s + categoryShareOf(t, kind, categoryId), 0n);
          expect(sum, `${n.id}/${p.id}`).toBe(p.totalMinor);
        }
      }
    }
  });
});

describe("periods", () => {
  it("knows the presets and the April–March financial year", () => {
    expect(periodOf("this_month", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodOf("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodOf("last_12_months", "2026-11-01")).toEqual({ from: "2025-12-01", to: "2026-11-30" });
    expect(financialYearPeriod("2026-03-31")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(financialYearPeriod("2026-04-01")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });

  it("fills months with nothing recorded as zero", () => {
    const trend = monthlyTrend([], { from: "2026-01-01", to: "2026-03-31" });
    expect(trend.map((m) => m.month)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(trend.every((m) => m.netMinor === 0n)).toBe(true);
  });
});

describe("safeToSpend (clarify Q1, 2026-11-01)", () => {
  const tx = (p: Partial<TransactionView>) => ({ kind: "expense", flow: "out", accountId: "bank", amountMinor: 0n, date: "2026-11-28", state: "active", confirmed: false, status: "uncleared", ...p }) as TransactionView;
  const counted = countedAccounts([
    { account: { id: "bank", type: "bank", state: "active" }, balance: 10_000_000n, excluded: false },
    { account: { id: "card", type: "credit_card", state: "active" }, balance: 1_825_000n, excluded: false },
    { account: { id: "family", type: "bank", state: "active" }, balance: 99_999_999n, excluded: true },
    { account: { id: "old", type: "wallet", state: "archived" }, balance: 0n, excluded: false },
  ]);

  it("is held − card owed − this month's upcoming outgoings − buffer (spec US1 3)", () => {
    const s = safeToSpend({
      heldMinor: counted.heldMinor,
      cardOwedMinor: counted.cardOwedMinor,
      countedAccountIds: counted.ids,
      monthEnd: "2026-11-30",
      bufferMinor: 500_000n,
      upcoming: [
        tx({ amountMinor: 2_500_000n }), // rent later this month
        tx({ kind: "transfer", toAccountId: "card", amountMinor: 1_825_000n }), // card bill: already in card owed
        tx({ kind: "income", flow: "in", amountMinor: 8_500_000n }), // salary not yet in: not counted
        tx({ amountMinor: 999n, date: "2026-12-03" }), // next month
        tx({ amountMinor: 777n, confirmed: true }), // already counted in the balance
        tx({ amountMinor: 666n, accountId: "family" }), // an account outside net worth
        tx({ kind: "person", flow: "out", amountMinor: 100_000n }), // lending planned this month
      ],
    });
    expect(s).toEqual({
      heldMinor: 10_000_000n,
      cardOwedMinor: 1_825_000n,
      upcomingMinor: 2_600_000n,
      bufferMinor: 500_000n,
      resultMinor: 5_075_000n,
      shortfallMinor: 0n,
    });
  });

  it("never goes below zero; the shortfall is kept", () => {
    const s = safeToSpend({ heldMinor: 100n, cardOwedMinor: 50n, countedAccountIds: new Set(), monthEnd: "2026-11-30", bufferMinor: 200n, upcoming: [] });
    expect([s.resultMinor, s.shortfallMinor]).toEqual([0n, 150n]);
  });
});
