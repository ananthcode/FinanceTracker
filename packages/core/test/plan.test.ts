import { describe, expect, it } from "vitest";
import {
  appliesIn,
  dueDate,
  editTerms,
  occurrenceId,
  planMonth,
  plannedFor,
  PlanRuleError,
  termFor,
  todayInZone,
  type LinkedTransaction,
  type PlanAccount,
  type PlanItem,
  type PlanOccurrence,
  type PlanTerm,
} from "../src";
import vectors from "./vectors/plan.json";

/** R7 T007 — months, terms, planned amounts, statuses and totals over the shared vectors (SC-001, SC-005). */

type RawTerm = { fromMonth: string; amountMinor: string | null; dueDay: number; accountId: string };
const term = (t: RawTerm): PlanTerm => ({ ...t, amountMinor: t.amountMinor === null ? null : BigInt(t.amountMinor) });

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
const accounts: PlanAccount[] = h.accounts.map((a) => ({
  ...a,
  type: a.type as PlanAccount["type"],
  balanceMinor: BigInt(a.balanceMinor),
  creditLimitMinor: a.creditLimitMinor === null ? null : BigInt(a.creditLimitMinor),
}));
const items = h.items.map((i) => item(i as Record<string, unknown>));
const occurrences: PlanOccurrence[] = h.occurrences.map((o) => ({
  id: occurrenceId("00000000-0000-4000-8000-000000000000", o.month),
  itemId: o.itemId,
  month: o.month,
  amountMinor: o.amountMinor === null ? null : BigInt(o.amountMinor),
  skipped: o.skipped,
}));
const links: LinkedTransaction[] = h.links.map((l) => {
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

/** Compares the listed fields only; bigint fields are written as strings in the vectors. */
function expectFields(actual: object, expected: Record<string, unknown>) {
  for (const [field, value] of Object.entries(expected)) {
    const got = (actual as Record<string, unknown>)[field];
    expect(typeof got === "bigint" ? got.toString() : got, field).toEqual(value);
  }
}

describe("occurrenceId (R7-02)", () => {
  for (const c of vectors.occurrenceId) {
    it(`${c.itemId} ${c.month}`, () => expect(occurrenceId(c.itemId, c.month)).toBe(c.id));
  }
  it("differs for every month of a long range and never repeats", () => {
    const ids = new Set<string>();
    for (let y = 2000; y < 2100; y++) for (let m = 1; m <= 12; m++) ids.add(occurrenceId("12345678-0000-4000-8000-000000000000", `${y}-${String(m).padStart(2, "0")}-01`));
    expect(ids.size).toBe(1200);
  });
});

describe("appliesIn (R7-04)", () => {
  for (const c of vectors.appliesIn) {
    it(`${JSON.stringify(c.item)} in ${c.month}`, () => expect(appliesIn(c.item, c.month)).toBe(c.applies));
  }
});

describe("dueDate (US2 6)", () => {
  for (const c of vectors.dueDate) {
    it(`day ${c.dueDay} in ${c.month}`, () => {
      expect(dueDate({ terms: [{ fromMonth: "2000-01-01", amountMinor: 1n, dueDay: c.dueDay, accountId: "a" }] }, c.month)).toBe(c.date);
    });
  }
});

describe("terms (FR-008, clarify Q5)", () => {
  const terms = vectors.terms.terms.map(term);
  for (const c of vectors.terms.termFor) {
    it(`term for ${c.month}`, () => expect(termFor({ terms }, c.month).amountMinor?.toString()).toBe(c.amountMinor));
  }
  for (const c of vectors.terms.edits) {
    it(`edit from ${c.from} in ${c.currentMonth}`, () => {
      const change = { ...c.change, ...("amountMinor" in c.change ? { amountMinor: BigInt(c.change.amountMinor as string) } : {}) };
      if ("error" in c) {
        expect(() => editTerms(terms, c.from, change, c.currentMonth)).toThrow(PlanRuleError);
        return;
      }
      expect(editTerms(terms, c.from, change, c.currentMonth)).toEqual((c.result as RawTerm[]).map(term));
    });
  }
  it("an edit before a future start applies from the start", () => {
    const future = [term({ fromMonth: "2026-12-01", amountMinor: "100", dueDay: 5, accountId: "a" })];
    expect(editTerms(future, "2026-11-01", { dueDay: 9 }, "2026-11-01")).toEqual([term({ fromMonth: "2026-12-01", amountMinor: "100", dueDay: 9, accountId: "a" })]);
  });
});

describe("plannedFor (R7-05, clarify Q3)", () => {
  const varying = items.find((i) => i.id === "elec")!;
  const card = items.find((i) => i.id === "cardbill")!;
  const fixed = items.find((i) => i.id === "rent")!;
  const base = { paidMinor: 0n, previousPaidMinor: 0n, currentMonth: "2026-11-01" };
  it("a set amount wins, even zero", () => {
    expect(plannedFor({ ...base, item: varying, month: "2026-11-01", occurrence: { amountMinor: 0n } })).toEqual({ plannedMinor: 0n, estimated: false, notSet: false });
    expect(plannedFor({ ...base, item: fixed, month: "2026-11-01", occurrence: { amountMinor: 999_999_999_999n } }).plannedMinor).toBe(999_999_999_999n);
  });
  it("a fixed item uses its usual amount", () => {
    expect(plannedFor({ ...base, item: fixed, month: "2026-11-01" })).toEqual({ plannedMinor: 2_500_000n, estimated: false, notSet: false });
  });
  it("a varying item: last month's paid amount, then the usual amount, both estimated", () => {
    expect(plannedFor({ ...base, item: varying, month: "2026-11-01", previousPaidMinor: 215_000n })).toEqual({ plannedMinor: 215_000n, estimated: true, notSet: false });
    expect(plannedFor({ ...base, item: varying, month: "2026-11-01" })).toEqual({ plannedMinor: 200_000n, estimated: true, notSet: false });
  });
  it("a varying item with something paid shows it as paid", () => {
    expect(plannedFor({ ...base, item: varying, month: "2026-11-01", paidMinor: 180_000n, previousPaidMinor: 215_000n })).toEqual({ plannedMinor: 180_000n, estimated: false, notSet: false });
  });
  it("a card bill in the current or coming month: owed now plus already paid", () => {
    expect(plannedFor({ ...base, item: card, month: "2026-11-01", cardOwedMinor: 1_200_000n, paidMinor: 800_000n })).toEqual({ plannedMinor: 2_000_000n, estimated: true, notSet: false });
    expect(plannedFor({ ...base, item: card, month: "2026-12-01", cardOwedMinor: 1_200_000n })).toEqual({ plannedMinor: 1_200_000n, estimated: true, notSet: false });
    expect(plannedFor({ ...base, item: card, month: "2026-11-01", cardOwedMinor: -5_000n }).plannedMinor).toBe(0n);
  });
  it("a card bill further ahead or in the past does not use the card's balance", () => {
    expect(plannedFor({ ...base, item: card, month: "2027-01-01", cardOwedMinor: 1_200_000n, previousPaidMinor: 900_000n }).plannedMinor).toBe(900_000n);
    expect(plannedFor({ ...base, item: card, month: "2026-09-01", cardOwedMinor: 1_200_000n })).toEqual({ plannedMinor: 0n, estimated: false, notSet: true });
  });
});

describe("planMonth over the household (FR-001 – FR-016, SC-001, SC-005)", () => {
  for (const v of h.views) {
    describe(v.month, () => {
      const view = planMonth({ month: v.month, today: h.today, items, occurrences, links, accounts });
      it("rows in due-date order with their amounts and statuses", () => {
        expect(view.rows.map((r) => r.itemId)).toEqual(v.rows.map((r) => r.itemId));
        v.rows.forEach((r, i) => expectFields(view.rows[i]!, r));
      });
      it("carried-over months", () => {
        expect(view.carried.map((r) => `${r.itemId} ${r.month}`)).toEqual(v.carried.map((r) => `${r.itemId} ${r.month}`));
        v.carried.forEach((r, i) => expectFields(view.carried[i]!, r));
      });
      it("totals add up exactly: planned = paid + still to pay − overpaid", () => {
        expectFields(view.totals, v.totals);
        expect(view.totals.plannedMinor).toBe(view.totals.paidMinor + view.totals.leftMinor - view.totals.overpaidMinor);
      });
      if ("countedHere" in v) it("counts carried-over months only in the current month", () => expect(view.countedHere).toBe(v.countedHere));
      if ("cash" in v) it("cash by account", () => expect(view.cash.map((c) => ({ ...c, leftMinor: `${c.leftMinor}`, availableMinor: `${c.availableMinor}`, shortMinor: `${c.shortMinor}` }))).toEqual(v.cash));
      if ("previous" in v) it("compared with last month", () => expectFields(view.previous, v.previous as Record<string, unknown>));
      if ("estimatedCount" in v) it("estimated amounts", () => expect(view.estimatedCount).toBe(v.estimatedCount));
    });
  }

  it("paying a carried-over month clears it from every month (US4 4)", () => {
    const paid = [...links, { ...links[0]!, id: "LX", planMonth: "2026-10-01", date: "2026-11-13" }];
    for (const month of ["2026-11-01", "2026-12-01"]) {
      expect(planMonth({ month, today: h.today, items, occurrences, links: paid, accounts }).carried).toEqual([]);
    }
  });

  it("an unconfirmed or void link is not paid; overpaying shows as overpaid", () => {
    const over = [...links, { ...links[0]!, id: "LY", planItemId: "emi", planMonth: "2026-11-01", amountMinor: 50_000n }];
    const view = planMonth({ month: "2026-11-01", today: h.today, items, occurrences, links: over, accounts });
    const emi = view.rows.find((r) => r.itemId === "emi")!;
    expect(emi.status).toBe("paid");
    expect(emi.overpaidMinor).toBe(50_000n);
    expect(view.totals.overpaidMinor).toBe(50_000n);
    expect(view.totals.plannedMinor).toBe(view.totals.paidMinor + view.totals.leftMinor - view.totals.overpaidMinor);
  });

  it("due today, and the user's timezone decides today", () => {
    const today = todayInZone("Asia/Kolkata", new Date("2026-11-04T18:45:00Z"));
    expect(today).toBe("2026-11-05");
    const view = planMonth({ month: "2026-11-01", today, items, occurrences, links, accounts });
    expect(view.rows.find((r) => r.itemId === "rent")!.status).toBe("part_paid");
    const unpaid = planMonth({ month: "2026-11-01", today, items, occurrences, links: links.filter((l) => l.id !== "L2"), accounts });
    expect(unpaid.rows.find((r) => r.itemId === "rent")!.status).toBe("due_today");
    // Just before midnight in India it is still the 4th: the rent is due, not due today.
    expect(todayInZone("Asia/Kolkata", new Date("2026-11-04T18:29:00Z"))).toBe("2026-11-04");
  });

  it("a card without a limit has no available amount; a short account says by how much", () => {
    const noLimit = accounts.map((a) => (a.id === "card" ? { ...a, creditLimitMinor: null } : a));
    const paidFromCard = items.map((i) => (i.id === "elec" ? { ...i, terms: i.terms.map((t) => ({ ...t, accountId: "card" })) } : i));
    const view = planMonth({ month: "2026-11-01", today: h.today, items: paidFromCard, occurrences, links, accounts: noLimit });
    expect(view.cash.find((c) => c.accountId === "card")).toEqual({ accountId: "card", leftMinor: 215_000n, availableMinor: null, shortMinor: 0n });
  });
});
