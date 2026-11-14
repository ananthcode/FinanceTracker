import { describe, expect, it } from "vitest";
import {
  Change,
  freeTemplateName,
  orderedTemplates,
  planMonth,
  readAmountBox,
  recordFromTemplate,
  templateFitsPlan,
  TemplateCreateFields,
  templateFromTransaction,
  templateProblems,
  TemplateUpdateFields,
  tieMessage,
  tiedPlanMonth,
  TransactionCreateFields,
  visibleTemplates,
  type TemplateView,
  type TransactionView,
} from "../src";
import { accounts, items, links, occurrences, today } from "./plan-household";

/** R8 T006 — quick-add template shapes and rules (FR-001 – FR-012; research R8-01 – R8-06). */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";
const T = "55555555-5555-4555-8555-555555555555";

const template = (t: Partial<TemplateView> = {}): TemplateView => ({
  id: "t1",
  name: "Milk",
  kind: "expense",
  flow: "out",
  accountId: A,
  toAccountId: null,
  amountMinor: 6_000n,
  payeeId: P,
  personAction: null,
  categoryId: C,
  lines: [],
  tagIds: [T],
  notes: "Morning milk",
  planItemId: null,
  sortKey: "a0",
  hidden: false,
  state: "active",
  ...t,
});

const wire = (fields: Record<string, unknown>) => ({ name: "Milk", kind: "expense", accountId: A, sortKey: "a0", ...fields });

describe("template shapes (FR-001, FR-002)", () => {
  it("accepts each kind with R4's rules, an amount or none", () => {
    expect(TemplateCreateFields.safeParse(wire({ amountMinor: "6000", payeeId: P, categoryId: C })).success).toBe(true);
    expect(TemplateCreateFields.safeParse(wire({ amountMinor: null })).success).toBe(true); // amount each time
    expect(TemplateCreateFields.safeParse(wire({ kind: "income", amountMinor: "8500000" })).success).toBe(true);
    expect(TemplateCreateFields.safeParse(wire({ kind: "transfer", toAccountId: B, amountMinor: "50000" })).success).toBe(true);
    expect(TemplateCreateFields.safeParse(wire({ kind: "person", payeeId: P, personAction: "repaid_to", amountMinor: "500000" })).success).toBe(true);
  });

  it("refuses what R4 refuses, interest, adjustments and a split without an amount", () => {
    expect(TemplateCreateFields.safeParse(wire({ kind: "transfer", toAccountId: A })).success).toBe(false); // same account
    expect(TemplateCreateFields.safeParse(wire({ kind: "person", personAction: "repaid_to" })).success).toBe(false); // no person
    expect(TemplateCreateFields.safeParse(wire({ kind: "person", payeeId: P, personAction: "adjustment" })).success).toBe(false);
    expect(TemplateCreateFields.safeParse(wire({ kind: "interest", payeeId: P })).success).toBe(false);
    const lines = [
      { id: crypto.randomUUID(), amountMinor: "4000", categoryId: C },
      { id: crypto.randomUUID(), amountMinor: "2000", categoryId: C },
    ];
    expect(TemplateCreateFields.safeParse(wire({ lines, amountMinor: null })).success).toBe(false);
    expect(TemplateCreateFields.safeParse(wire({ lines, amountMinor: "6000" })).success).toBe(true);
    expect(TemplateCreateFields.safeParse(wire({ lines, amountMinor: "6001" })).success).toBe(false);
    expect(TemplateCreateFields.safeParse(wire({ name: " ".repeat(3) })).success).toBe(false);
    expect(TemplateCreateFields.safeParse(wire({ name: "x".repeat(41) })).success).toBe(false);
  });

  it("an update sends the amount and the lines together", () => {
    expect(TemplateUpdateFields.safeParse({ amountMinor: "7000" }).success).toBe(false);
    expect(TemplateUpdateFields.safeParse({ amountMinor: "7000", lines: [] }).success).toBe(true);
    expect(TemplateUpdateFields.safeParse({ amountMinor: null, lines: [] }).success).toBe(true);
    expect(TemplateUpdateFields.safeParse({ hidden: true }).success).toBe(true);
    expect(TemplateUpdateFields.safeParse({ kind: "income" }).success).toBe(false);
  });

  it("is a sync entity with create, update and delete only", () => {
    const base = { changeId: crypto.randomUUID(), entity: "template", entityId: crypto.randomUUID(), hlc: "1762000000000.0000.webbrw01" };
    expect(Change.safeParse({ ...base, kind: "create", fields: wire({}) }).success).toBe(true);
    expect(Change.safeParse({ ...base, kind: "delete" }).success).toBe(true);
    expect(Change.safeParse({ ...base, kind: "archive" }).success).toBe(false);
  });
});

describe("order and Save as template (FR-003, FR-004)", () => {
  it("lists live templates by order key, hidden ones only in Manage", () => {
    const list = [template({ id: "b", name: "B", sortKey: "a2" }), template({ id: "a", name: "A", sortKey: "a1" }), template({ id: "h", sortKey: "a0", hidden: true }), template({ id: "d", sortKey: "Z", state: "deleted" })];
    expect(visibleTemplates(list).map((t) => t.id)).toEqual(["a", "b"]);
    expect(orderedTemplates(list).map((t) => t.id)).toEqual(["h", "a", "b"]);
  });

  it("suggests a free name from the payee, else the notes", () => {
    expect(freeTemplateName("Fresh Mart", ["fresh mart", "Fresh Mart (2)"])).toBe("Fresh Mart (3)");
    expect(freeTemplateName("x".repeat(45), [])).toHaveLength(40);
    const tx: TransactionView = {
      id: "tx", date: "2026-11-10", timeOfDay: "09:30", kind: "expense", flow: "out", accountId: A, toAccountId: null, amountMinor: 124_000n,
      payeeId: P, personAction: null, categoryId: C, lines: [], tagIds: [T], notes: "Weekly shop", reference: "R-1", status: "cleared",
      confirmed: true, generated: false, interestMonth: null, userEdited: false, state: "active", planItemId: "plan", planMonth: "2026-11-01",
    };
    const draft = templateFromTransaction(tx, ["Fresh Mart"], { payee: () => "Fresh Mart" })!;
    expect(draft).toMatchObject({ name: "Fresh Mart (2)", kind: "expense", amountMinor: 124_000n, payeeId: P, categoryId: C, tagIds: [T], notes: "Weekly shop", planItemId: null });
    expect(draft).not.toHaveProperty("date");
    expect(draft).not.toHaveProperty("reference");
    expect(templateFromTransaction({ ...tx, payeeId: null }, [], { payee: () => null })!.name).toBe("Weekly shop");
    expect(templateFromTransaction({ ...tx, kind: "interest" }, [], { payee: () => null })).toBeNull();
  });
});

describe("recording (FR-007 – FR-011; clarify Q4)", () => {
  it("is an ordinary transaction for today with the box's amount, valid for R4", () => {
    const fields = recordFromTemplate(template(), { amountMinor: 7_500n, today: "2026-11-14", pays: null, newId: () => crypto.randomUUID() });
    expect(fields).toMatchObject({ kind: "expense", date: "2026-11-14", accountId: A, amountMinor: "7500", payeeId: P, categoryId: C, tagIds: [T], notes: "Morning milk", status: "uncleared", confirmed: true, planItemId: null, planMonth: null });
    expect(TransactionCreateFields.safeParse(fields).success).toBe(true);
    const tied = recordFromTemplate(template(), { amountMinor: 6_000n, today: "2026-11-14", pays: { itemId: crypto.randomUUID(), month: "2026-11-01" }, newId: () => crypto.randomUUID() });
    expect(TransactionCreateFields.safeParse(tied).success).toBe(true);
  });

  it("reads the amount box: empty and invalid refused; a split's amount changes only in the form", () => {
    expect(readAmountBox(template(), "", "INR")).toEqual({ ok: false, message: "Enter the amount." });
    expect(readAmountBox(template(), "abc", "INR")).toMatchObject({ ok: false });
    expect(readAmountBox(template(), "0", "INR")).toMatchObject({ ok: false });
    expect(readAmountBox(template(), "1,240.00", "INR")).toEqual({ ok: true, amountMinor: 124_000n });
    const split = template({ amountMinor: 6_000n, categoryId: null, lines: [
      { id: "l1", amountMinor: 4_000n, categoryId: C, personId: null, personAction: null, notes: null, tagIds: [] },
      { id: "l2", amountMinor: 2_000n, categoryId: C, personId: null, personAction: null, notes: null, tagIds: [] },
    ] });
    expect(readAmountBox(split, "60.00", "INR")).toEqual({ ok: true, amountMinor: 6_000n });
    expect(readAmountBox(split, "70.00", "INR")).toEqual({ ok: false, openForm: true });
  });

  it("names what went away; a hidden payee or category is still fine", () => {
    const live = { accounts: new Set([A]), payees: new Set([P]), categories: new Set([C]), tags: new Set([T]) };
    expect(templateProblems(template(), live)).toEqual([]);
    expect(templateProblems(template({ accountId: B }), live)).toEqual(["account"]);
    expect(templateProblems(template({ kind: "transfer", toAccountId: B, payeeId: null, categoryId: null }), live)).toEqual(["toAccount"]);
    expect(templateProblems(template(), { ...live, payees: new Set(), categories: new Set(), tags: new Set() })).toEqual(["payee", "category", "tag"]);
  });
});

describe("the tie to a planned payment (FR-012; clarify Q1)", () => {
  const view = planMonth({ month: "2026-11-01", today, items, occurrences, links, accounts });
  const rent = items.find((i) => i.id === "rent")!;
  const tied = template({ payeeId: "landlord", planItemId: "rent" });

  it("fits the R7 rule: same payee for a payee item, a transfer into the card for a card bill", () => {
    expect(templateFitsPlan(tied, rent)).toBe(true);
    expect(templateFitsPlan({ ...tied, payeeId: "someone" }, rent)).toBe(false);
    expect(templateFitsPlan({ ...tied, kind: "income" }, rent)).toBe(false);
    const card = items.find((i) => i.id === "cardbill")!;
    expect(templateFitsPlan({ kind: "transfer", payeeId: null, toAccountId: "card", personAction: null }, card)).toBe(true);
  });

  it("pays the oldest carried-over month first, then this month, else says why", () => {
    // October's rent is carried over (₹25,000.00 left), November's part paid.
    const first = tiedPlanMonth(tied, rent, view);
    expect(first.pays?.month).toBe("2026-10-01");
    expect(tieMessage(first, "2026-11-01")).toBe("pays Rent (October 2026)");
    const novemberOnly = tiedPlanMonth(tied, rent, { ...view, carried: [] });
    expect(novemberOnly.pays?.month).toBe("2026-11-01");
    const paid = tiedPlanMonth(tied, rent, { rows: view.rows.map((r) => (r.itemId === "rent" ? { ...r, leftMinor: 0n, status: "paid" as const } : r)), carried: [] });
    expect(tieMessage(paid, "2026-11-01")).toBe("not linked: Rent is already paid for November 2026");
    expect(tieMessage(tiedPlanMonth(tied, undefined, view), "2026-11-01")).toBe("not linked: that planned payment no longer exists");
    expect(tieMessage(tiedPlanMonth(tied, { ...rent, state: "deleted" }, view), "2026-11-01")).toBe("not linked: that planned payment no longer exists");
    expect(tieMessage(tiedPlanMonth({ ...tied, payeeId: "someone" }, rent, view), "2026-11-01")).toBe("not linked: the template no longer fits Rent");
    expect(tiedPlanMonth(template(), rent, view)).toMatchObject({ pays: null, reason: "not_tied" });
  });
});
