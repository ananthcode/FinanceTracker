import { describe, expect, it } from "vitest";
import {
  demoAccounts,
  demoLists,
  demoTransactions,
  isCounted,
  PERSON_ACTIONS,
  PersonRateCreateFields,
  TransactionCreateFields,
  TRANSACTION_KINDS,
  type TransactionView,
} from "../src";

/** R4 T057 — the deterministic demo transactions (research R4-10). */
const TODAY = "2026-10-31";
const wire = (t: TransactionView) => ({
  kind: t.kind,
  date: t.date,
  timeOfDay: t.timeOfDay,
  accountId: t.accountId,
  toAccountId: t.toAccountId,
  amountMinor: t.amountMinor.toString(),
  payeeId: t.payeeId,
  personAction: t.personAction,
  ...(t.kind === "interest" || t.personAction === "adjustment" ? { flow: t.flow } : {}),
  categoryId: t.categoryId,
  lines: t.lines.map((l) => ({ ...l, amountMinor: l.amountMinor.toString() })),
  tagIds: t.tagIds,
  notes: t.notes,
  reference: t.reference,
  status: t.status,
  confirmed: t.confirmed,
});

describe("demoTransactions", () => {
  const { transactions, rates } = demoTransactions(TODAY);

  it("is the same every time for the same day", () => {
    expect(demoTransactions(TODAY)).toEqual(demoTransactions(TODAY));
    expect(new Set(transactions.map((t) => t.id)).size).toBe(transactions.length);
  });

  it("is a realistic volume: every month since April 2025", () => {
    expect(transactions.length).toBeGreaterThan(250); // about 14 a month
    expect(transactions.some((t) => t.date.startsWith("2025-04"))).toBe(true);
    expect(transactions.some((t) => t.date.startsWith("2026-10"))).toBe(true);
  });

  it("passes the sync rules: every transaction and rate is valid on the wire", () => {
    for (const t of transactions) {
      const parsed = TransactionCreateFields.safeParse(wire(t));
      expect(parsed.success, `${t.id} ${t.kind} ${t.date}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true);
    }
    for (const r of rates) expect(PersonRateCreateFields.safeParse({ payeeId: r.payeeId, effectiveMonth: r.effectiveMonth, rateE4: r.rateE4 }).success).toBe(true);
  });

  it("uses only active demo accounts and live demo lists, never before an opening date", () => {
    const accounts = new Map(demoAccounts().accounts.map((a) => [a.id, a]));
    const { categories, payees, tags } = demoLists();
    const categoryIds = new Set(categories.map((c) => c.id));
    const people = new Map(payees.map((p) => [p.id, p]));
    const tagIds = new Set(tags.map((t) => t.id));
    for (const t of transactions) {
      for (const id of [t.accountId, t.toAccountId]) {
        if (!id) continue;
        expect(accounts.get(id)?.state, t.id).toBe("active");
        expect(t.date >= accounts.get(id)!.openingBalanceDate, t.id).toBe(true);
      }
      if (t.categoryId) expect(categoryIds.has(t.categoryId)).toBe(true);
      if (t.payeeId) expect(people.has(t.payeeId)).toBe(true);
      for (const l of t.lines) {
        if (l.categoryId) expect(categoryIds.has(l.categoryId)).toBe(true);
        if (l.personId) expect(people.get(l.personId)?.kind).toBe("person");
      }
      for (const id of t.tagIds) expect(tagIds.has(id)).toBe(true);
    }
  });

  it("covers every kind, every person action, splits, statuses, upcoming and To confirm", () => {
    for (const kind of TRANSACTION_KINDS) expect(transactions.some((t) => t.kind === kind), kind).toBe(true);
    const actions = new Set(transactions.flatMap((t) => [t.personAction, ...t.lines.map((l) => l.personAction)]).filter(Boolean));
    expect([...actions].sort()).toEqual([...PERSON_ACTIONS].sort());
    expect(transactions.some((t) => t.lines.length >= 3)).toBe(true);
    for (const s of ["cleared", "uncleared", "follow_up", "void"]) expect(transactions.some((t) => t.status === s), s).toBe(true);
    expect(transactions.some((t) => !t.confirmed && t.date > TODAY)).toBe(true); // upcoming
    expect(transactions.some((t) => !t.confirmed && t.date <= TODAY)).toBe(true); // waiting in To confirm
    expect(transactions.filter((t) => !isCounted(t)).length).toBeGreaterThanOrEqual(3);
  });
});
