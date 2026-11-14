import { describe, expect, it } from "vitest";
import {
  amountNear,
  isNudgeSnoozed,
  likelyMatches,
  moveStart,
  nudgeFor,
  payDraft,
  paysSuggestions,
  planCheckMonth,
  planMonth,
  planUnpaidForSafeToSpend,
  withLikely,
  type TransactionView,
} from "../src";
import { accounts, items, links, occurrences, termsVector, today } from "./plan-household";

const byId = new Map(items.map((i) => [i.id, i]));
const view = planMonth({ month: "2026-11-01", today, items, occurrences, links, accounts });
const row = (id: string) => view.rows.find((r) => r.itemId === id)!;

/** R7 T023 — likely matches, "Pays:" suggestions and the Pay pre-fill (FR-010, FR-011, FR-013). */
describe("matching and Pay (R7-07, R7-10)", () => {
  const candidate = (c: Partial<TransactionView> & { id: string }): TransactionView => ({
    date: "2026-11-12",
    timeOfDay: null,
    kind: "expense",
    flow: "out",
    accountId: "sav",
    toAccountId: null,
    amountMinor: 1_500_000n,
    payeeId: "landlord",
    personAction: null,
    categoryId: null,
    lines: [],
    tagIds: [],
    notes: null,
    reference: null,
    status: "uncleared",
    confirmed: true,
    generated: false,
    interestMonth: null,
    userEdited: false,
    state: "active",
    planItemId: null,
    planMonth: null,
    warrantyUntil: null,
    warrantyNote: null,
    warrantyDismissed: 0,
    ...c,
  });

  it("the amount is within ±20 % of what is left, in whole paise, edges included", () => {
    expect(amountNear(1_200_000n, 1_500_000n)).toBe(true); // exactly −20 %
    expect(amountNear(1_199_999n, 1_500_000n)).toBe(false);
    expect(amountNear(1_800_000n, 1_500_000n)).toBe(true); // exactly +20 %
    expect(amountNear(1_800_001n, 1_500_000n)).toBe(false);
    expect(amountNear(6n, 5n)).toBe(true);
    expect(amountNear(7n, 5n)).toBe(false);
    expect(amountNear(0n, 0n)).toBe(false); // nothing left: nothing to match
  });

  it("matches the same payee, near the amount and the date; best first; linked, void and deleted ones left out", () => {
    const rent = row("rent"); // ₹15,000.00 left, due 2026-11-05
    const found = likelyMatches(rent, byId.get("rent")!, [
      candidate({ id: "far", amountMinor: 1_750_000n, date: "2026-11-06" }),
      candidate({ id: "exact-late", amountMinor: 1_500_000n, date: "2026-11-12" }),
      candidate({ id: "exact-near", amountMinor: 1_500_000n, date: "2026-11-04" }),
      candidate({ id: "other-payee", payeeId: "school" }),
      candidate({ id: "too-small", amountMinor: 1_000_000n }),
      candidate({ id: "linked", planItemId: "emi", planMonth: "2026-11-01" }),
      candidate({ id: "void", status: "void" }),
      candidate({ id: "deleted", state: "deleted" }),
      candidate({ id: "income", kind: "income", flow: "in" }),
      candidate({ id: "next-month-far", date: "2026-12-10" }),
      candidate({ id: "before-month-near", date: "2026-10-27" }),
      candidate({ id: "before-month-far", date: "2026-10-25" }),
    ]);
    expect(found.map((t) => t.id)).toEqual(["exact-near", "exact-late", "before-month-near", "far"]);
  });

  it("matches a card bill by a transfer into the card and a person item by money out to them", () => {
    const card = row("cardbill"); // ₹20,000.00 left
    expect(
      likelyMatches(card, byId.get("cardbill")!, [
        candidate({ id: "to-card", kind: "transfer", payeeId: null, toAccountId: "card", amountMinor: 2_000_000n }),
        candidate({ id: "on-card", kind: "expense", accountId: "card", amountMinor: 2_000_000n }),
      ]).map((t) => t.id),
    ).toEqual(["to-card"]);
    const person = { ...byId.get("rent")!, id: "repay", target: "person" as const, payeeId: "meera", personAction: "repaid_to" as const };
    const personRow = { ...row("rent"), itemId: "repay" };
    expect(
      likelyMatches(personRow, person, [
        candidate({ id: "repaid", kind: "person", payeeId: "meera", personAction: "repaid_to" }),
        candidate({ id: "received", kind: "person", payeeId: "meera", personAction: "received_back", flow: "in" }),
      ]).map((t) => t.id),
    ).toEqual(["repaid"]);
  });

  it("offers each transaction to one row only (Looks paid — link?)", () => {
    const rows = withLikely(view.rows, byId, [candidate({ id: "one", amountMinor: 1_500_000n })]);
    expect(rows.filter((r) => r.likely === "one").map((r) => r.itemId)).toEqual(["rent"]);
    expect(withLikely(view.rows, byId, []).every((r) => r.likely === null)).toBe(true);
  });

  it("suggests the unpaid item-months a new transaction likely pays, best first", () => {
    const all = [...view.carried, ...view.rows];
    const draft = { kind: "expense" as const, payeeId: "landlord", toAccountId: null, personAction: null, amountMinor: 1_500_000n, date: "2026-11-13" };
    // This month's rent has exactly ₹15,000.00 left; October's carried rent (₹25,000.00 left) is too far.
    expect(paysSuggestions(draft, all, byId).map((r) => `${r.itemId} ${r.month}`)).toEqual(["rent 2026-11-01"]);
    expect(paysSuggestions({ ...draft, amountMinor: 2_500_000n, date: "2026-10-12" }, all, byId).map((r) => `${r.itemId} ${r.month}`)).toEqual(["rent 2026-10-01"]);
    expect(paysSuggestions({ ...draft, payeeId: "nobody" }, all, byId)).toEqual([]);
    expect(paysSuggestions({ ...draft, kind: "income" }, all, byId)).toEqual([]);
  });

  it("Pay pre-fills what is left, today, the account and the target (FR-010)", () => {
    const live = { accounts: new Set(["sav", "card"]), payees: new Set(["landlord"]), categories: new Set<string>() };
    expect(payDraft(row("rent"), byId.get("rent")!, today, live)).toEqual({
      kind: "expense", date: "2026-11-13", accountId: "sav", toAccountId: null, amountMinor: 1_500_000n, payeeId: "landlord",
      personAction: null, categoryId: null, notes: "Rent — November 2026", planItemId: "rent", planMonth: "2026-11-01",
    });
    expect(payDraft(row("cardbill"), byId.get("cardbill")!, today, live)).toMatchObject({ kind: "transfer", accountId: "sav", toAccountId: "card", amountMinor: 2_000_000n, payeeId: null });
    const person = { ...byId.get("rent")!, target: "person" as const, payeeId: "landlord", personAction: "lent" as const };
    expect(payDraft(row("rent"), person, today, live)).toMatchObject({ kind: "person", personAction: "lent", payeeId: "landlord", categoryId: null });
    // A paid row pre-fills the planned amount; an archived account or a deleted payee is left empty.
    expect(payDraft(row("emi"), byId.get("emi")!, today, { ...live, accounts: new Set<string>(), payees: new Set<string>() })).toMatchObject({
      amountMinor: 4_250_000n, accountId: null, payeeId: null,
    });
  });
});

/** R7 T032 — safe to spend with the plan, and the month-check nudge (FR-018, FR-023, SC-008). */
describe("safe to spend and the nudge (R7-08, R7-09)", () => {
  it("counts unpaid non-card items from counted accounts, carried ones included, less linked upcoming payments", () => {
    // rent 15,000 + fees 16,000 + electricity 2,150 + gift (5,000 − 5,000 upcoming linked) + carried rent 25,000; the card bill is left out.
    expect(planUnpaidForSafeToSpend(view, byId, new Set(["sav"]), "2026-11-30")).toBe(1_500_000n + 1_600_000n + 215_000n + 0n + 2_500_000n);
    // An upcoming link dated after the month's end is not in R6's upcoming, so it is not taken off here.
    expect(planUnpaidForSafeToSpend(view, byId, new Set(["sav"]), "2026-11-20")).toBe(1_500_000n + 1_600_000n + 215_000n + 500_000n + 2_500_000n);
    expect(planUnpaidForSafeToSpend(view, byId, new Set<string>(), "2026-11-30")).toBe(0n); // account outside net worth
    const december = planMonth({ month: "2026-12-01", today, items, occurrences, links, accounts });
    expect(planUnpaidForSafeToSpend(december, byId, new Set(["sav"]), "2026-12-31")).toBe(4_250_000n + 200_000n); // carried rows not counted there
  });

  it("nudges from the 25th about next month and from the 1st to the 5th about this month", () => {
    const on = { planNudge: true, planCheckedMonth: null };
    expect(nudgeFor("2026-11-24", on)).toBeNull();
    expect(nudgeFor("2026-11-25", on)).toBe("2026-12-01");
    expect(nudgeFor("2026-11-30", on)).toBe("2026-12-01");
    expect(nudgeFor("2026-12-01", on)).toBe("2026-12-01");
    expect(nudgeFor("2026-12-05", on)).toBe("2026-12-01");
    expect(nudgeFor("2026-12-06", on)).toBeNull();
    expect(nudgeFor("2026-12-28", on)).toBe("2027-01-01"); // December to January
    expect(nudgeFor("2027-01-03", on)).toBe("2027-01-01");
    expect(nudgeFor("2028-02-29", on)).toBe("2028-03-01");
  });

  it("stops for a checked month and when the reminder is off", () => {
    expect(nudgeFor("2026-11-26", { planNudge: false, planCheckedMonth: null })).toBeNull();
    expect(nudgeFor("2026-11-26", { planNudge: true, planCheckedMonth: "2026-12-01" })).toBeNull();
    expect(nudgeFor("2026-12-02", { planNudge: true, planCheckedMonth: "2026-12-01" })).toBeNull();
    expect(nudgeFor("2026-12-26", { planNudge: true, planCheckedMonth: "2026-12-01" })).toBe("2027-01-01"); // the next month is not checked
    expect(nudgeFor("2026-11-26", { planNudge: true, planCheckedMonth: "2026-11-01" })).toBe("2026-12-01");
  });

  it("offers Plan checked for one month only, and Not now lasts until the next day", () => {
    expect(planCheckMonth("2026-11-13")).toBe("2026-12-01");
    expect(planCheckMonth("2026-11-26")).toBe("2026-12-01");
    expect(planCheckMonth("2026-12-03")).toBe("2026-12-01");
    expect(planCheckMonth("2026-12-06")).toBe("2027-01-01");
    expect(isNudgeSnoozed("2026-11-26", "2026-11-27")).toBe(true);
    expect(isNudgeSnoozed("2026-11-27", "2026-11-27")).toBe(false);
    expect(isNudgeSnoozed("2026-11-26", null)).toBe(false);
    expect(isNudgeSnoozed("2026-11-26", "nonsense")).toBe(false);
  });

  it("moving an item's start keeps the term in force then", () => {
    expect(moveStart(termsVector, "2026-03-01").map((t) => `${t.fromMonth} ${t.amountMinor}`)).toEqual(["2026-03-01 100", "2026-06-01 200"]);
    expect(moveStart(termsVector, "2026-08-01").map((t) => `${t.fromMonth} ${t.amountMinor}`)).toEqual(["2026-08-01 200"]);
    expect(moveStart(termsVector, "2025-11-01").map((t) => `${t.fromMonth} ${t.amountMinor}`)).toEqual(["2025-11-01 100", "2026-01-01 100", "2026-06-01 200"]);
  });
});
