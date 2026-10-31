import { describe, expect, it } from "vitest";
import { Change } from "../src/sync/schemas";

/** R4 T003 — transaction, person-rate and relocate shapes (contracts/sync-protocol.md; Principle VIII). */
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ACC, ACC2, PAYEE, CAT, CAT2, PERSON, TAG] = [1, 2, 3, 4, 5, 6, 7].map(u);
const hlc = "1793011200000.0000.webbrw01";
const change = (entity: string, kind: string, fields?: Record<string, unknown>) =>
  Change.safeParse({ changeId: u(100), entity, entityId: u(101), kind, fields, hlc });

const expense = { kind: "expense", date: "2026-10-05", accountId: ACC, amountMinor: "123450", payeeId: PAYEE, categoryId: CAT };
const line = (n: number, amountMinor: string, extra: Record<string, unknown> = {}) => ({ id: u(200 + n), amountMinor, categoryId: CAT, ...extra });

describe("transaction create", () => {
  it("accepts an expense and fills defaults", () => {
    const r = change("transaction", "create", expense);
    expect(r.success).toBe(true);
    expect(r.data?.fields).toMatchObject({ status: "uncleared", confirmed: true, lines: [], tagIds: [], timeOfDay: null });
  });

  it("allows Uncategorised (no category, no split) — clarify Q1", () => {
    expect(change("transaction", "create", { ...expense, categoryId: null }).success).toBe(true);
  });

  it("checks amounts: positive whole paise as strings, within the maximum", () => {
    for (const bad of ["0", "-100", "12.50", 100, "1000000000000"]) {
      expect(change("transaction", "create", { ...expense, amountMinor: bad }).success, String(bad)).toBe(false);
    }
    expect(change("transaction", "create", { ...expense, amountMinor: "999999999999" }).success).toBe(true);
  });

  it("checks each kind's shape", () => {
    expect(change("transaction", "create", { kind: "transfer", date: "2026-10-05", accountId: ACC, toAccountId: ACC2, amountMinor: "1825000" }).success).toBe(true);
    expect(change("transaction", "create", { kind: "transfer", date: "2026-10-05", accountId: ACC, toAccountId: ACC, amountMinor: "100" }).success).toBe(false);
    expect(change("transaction", "create", { kind: "transfer", date: "2026-10-05", accountId: ACC, toAccountId: ACC2, amountMinor: "100", categoryId: CAT }).success).toBe(false);
    const lent = { kind: "person", date: "2026-10-05", accountId: ACC, amountMinor: "500000", payeeId: PERSON, personAction: "lent" };
    expect(change("transaction", "create", lent).success).toBe(true);
    expect(change("transaction", "create", { ...lent, accountId: null }).success).toBe(false);
    expect(change("transaction", "create", { ...lent, flow: "in" }).success).toBe(false);
    const adjustment = { kind: "person", date: "2026-10-05", amountMinor: "100000", payeeId: PERSON, personAction: "adjustment", flow: "in" };
    expect(change("transaction", "create", { ...adjustment, notes: "Forgave part of the loan" }).success).toBe(true);
    expect(change("transaction", "create", adjustment).success).toBe(false); // a reason is required
    expect(change("transaction", "create", { ...adjustment, notes: "x", flow: null }).success).toBe(false);
    expect(change("transaction", "create", { kind: "interest", date: "2026-10-31", amountMinor: "100000", payeeId: PERSON, flow: "out" }).success).toBe(true);
    expect(change("transaction", "create", { kind: "interest", date: "2026-10-31", amountMinor: "100000", payeeId: PERSON, flow: "out", accountId: ACC }).success).toBe(false);
  });

  it("checks splits: 2–50 lines adding up, category xor person share matching the direction", () => {
    const split = { ...expense, categoryId: null, amountMinor: "450000", lines: [line(1, "320000"), line(2, "105000", { categoryId: CAT2 }), line(3, "25000")] };
    expect(change("transaction", "create", split).success).toBe(true);
    expect(change("transaction", "create", { ...split, amountMinor: "450001" }).success).toBe(false);
    expect(change("transaction", "create", { ...split, lines: [line(1, "450000")] }).success).toBe(false);
    expect(change("transaction", "create", { ...split, categoryId: CAT }).success).toBe(false);
    const share = { ...expense, categoryId: null, amountMinor: "300000", lines: [line(1, "100000"), line(2, "200000", { categoryId: null, personId: PERSON, personAction: "paid_on_behalf" })] };
    expect(change("transaction", "create", share).success).toBe(true);
    const wrongWay = { ...share, lines: [line(1, "100000"), line(2, "200000", { categoryId: null, personId: PERSON, personAction: "collected_on_behalf" })] };
    expect(change("transaction", "create", wrongWay).success).toBe(false);
    const both = { ...share, lines: [line(1, "100000"), line(2, "200000", { personId: PERSON, personAction: "paid_on_behalf" })] };
    expect(change("transaction", "create", both).success).toBe(false);
  });

  it("limits notes, reference and tags", () => {
    expect(change("transaction", "create", { ...expense, notes: "n".repeat(1001) }).success).toBe(false);
    expect(change("transaction", "create", { ...expense, reference: "r".repeat(41) }).success).toBe(false);
    expect(change("transaction", "create", { ...expense, tagIds: [TAG] }).success).toBe(true);
  });
});

describe("transaction update", () => {
  it("never changes the kind and moves amount and lines together", () => {
    expect(change("transaction", "update", { kind: "income" }).success).toBe(false);
    expect(change("transaction", "update", { amountMinor: "100" }).success).toBe(false);
    expect(change("transaction", "update", { amountMinor: "100", lines: [] }).success).toBe(true);
    expect(change("transaction", "update", { confirmed: true }).success).toBe(true);
    expect(change("transaction", "update", { status: "void" }).success).toBe(true);
  });

  it("rejects server-controlled fields", () => {
    for (const extra of [{ generated: true }, { interestMonth: "2026-10-01" }, { userEdited: true }, { state: "deleted" }, { serverSeq: "1" }]) {
      expect(change("transaction", "update", { notes: "x", ...extra }).success).toBe(false);
    }
  });
});

describe("person rates and relocate", () => {
  it("takes a rate from the 1st of a month, 0–10 % a month", () => {
    expect(change("person_rate", "create", { payeeId: PERSON, effectiveMonth: "2026-04-01", rateE4: 10000 }).success).toBe(true);
    expect(change("person_rate", "create", { payeeId: PERSON, effectiveMonth: "2026-04-15", rateE4: 10000 }).success).toBe(false);
    expect(change("person_rate", "create", { payeeId: PERSON, effectiveMonth: "2026-04-01", rateE4: 100001 }).success).toBe(false);
    expect(change("person_rate", "create", { payeeId: PERSON, effectiveMonth: "2026-04-01", rateE4: 0 }).success).toBe(true);
  });

  it("relocates categories and payees only", () => {
    expect(change("category", "relocate", { targetId: CAT2 }).success).toBe(true);
    expect(change("payee", "relocate", { targetId: PAYEE }).success).toBe(true);
    expect(change("tag", "relocate", { targetId: TAG }).success).toBe(false);
  });

  it("keeps businesses at no interest", () => {
    expect(change("payee", "create", { name: "Shop", kind: "business", interestMode: "automatic" }).success).toBe(false);
    expect(change("payee", "update", { interestMode: "automatic" }).success).toBe(true);
  });
});
