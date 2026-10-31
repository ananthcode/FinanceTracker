import { describe, expect, it } from "vitest";
import { currentBalance, type AccountType } from "../src/accounts";
import { personBalance } from "../src/people";
import { isCounted, movementsOf, personMovementsOf, postingsOf, type Posting, type TransactionView } from "../src/transactions";
import vectors from "./vectors/transactions.json";

/** R4 T004 — postings, balances and totals over the shared vectors (FR-007 – FR-012; SC-002). */
type VectorTx = Record<string, unknown> & { id: string; amountMinor: string; lines?: { amountMinor: string }[] };

export function toTransaction(t: VectorTx): TransactionView {
  return {
    id: t.id,
    date: t.date as string,
    timeOfDay: null,
    kind: t.kind as TransactionView["kind"],
    flow: t.flow as TransactionView["flow"],
    accountId: (t.accountId as string) ?? null,
    toAccountId: (t.toAccountId as string) ?? null,
    amountMinor: BigInt(t.amountMinor),
    payeeId: (t.payeeId as string) ?? null,
    personAction: (t.personAction as TransactionView["personAction"]) ?? null,
    categoryId: (t.categoryId as string) ?? null,
    lines: (t.lines ?? []).map((l) => {
      const line = l as Record<string, unknown>;
      return {
        id: line.id as string,
        amountMinor: BigInt(l.amountMinor),
        categoryId: (line.categoryId as string) ?? null,
        personId: (line.personId as string) ?? null,
        personAction: (line.personAction as "paid_on_behalf" | "collected_on_behalf") ?? null,
        notes: null,
        tagIds: [],
      };
    }),
    tagIds: [],
    notes: null,
    reference: null,
    status: (t.status as TransactionView["status"]) ?? "uncleared",
    confirmed: (t.confirmed as boolean) ?? true,
    generated: false,
    interestMonth: null,
    userEdited: false,
    state: (t.state as "active" | "deleted") ?? "active",
  };
}

const asJson = (p: Posting) => ({ ...p, effect: p.effect.toString() });

describe("postings vectors", () => {
  for (const c of vectors.cases) {
    const types = new Map(c.accounts.map((a) => [a.id, a.type as AccountType]));
    const typeOf = (id: string) => types.get(id)!;
    const transactions = (c.transactions as VectorTx[]).map(toTransaction);

    it(`${c.name}: account balances`, () => {
      const movements = movementsOf(transactions, typeOf);
      for (const a of c.accounts) {
        const balance = currentBalance({ id: a.id, openingBalanceMinor: BigInt(a.openingBalanceMinor), openingBalanceDate: a.openingBalanceDate }, movements);
        expect(balance, a.id).toBe(BigInt((c.expect.accountBalances as Record<string, string>)[a.id]!));
      }
    });

    it(`${c.name}: person balances`, () => {
      for (const p of c.people) {
        const balance = personBalance({ openingBalanceMinor: BigInt(p.openingBalanceMinor) }, personMovementsOf(transactions, p.id, typeOf));
        expect(balance, p.id).toBe(BigInt((c.expect.personBalances as Record<string, string>)[p.id]!));
      }
    });

    it(`${c.name}: spending and income per category`, () => {
      const totals = { expense: new Map<string, bigint>(), income: new Map<string, bigint>() };
      for (const tx of transactions.filter(isCounted)) {
        for (const p of postingsOf(tx, typeOf)) {
          if (p.type !== "category") continue;
          const key = p.categoryId ?? "uncategorised";
          totals[p.kind].set(key, (totals[p.kind].get(key) ?? 0n) + p.effect);
        }
      }
      const asStrings = (m: Map<string, bigint>) => Object.fromEntries([...m].map(([k, v]) => [k, v.toString()]));
      expect(asStrings(totals.expense)).toEqual(c.expect.spending);
      expect(asStrings(totals.income)).toEqual(c.expect.income);
    });

    it(`${c.name}: postings of listed transactions`, () => {
      for (const [id, expected] of Object.entries(c.expect.postings)) {
        const tx = transactions.find((t) => t.id === id)!;
        expect(postingsOf(tx, typeOf).map(asJson), id).toEqual(expected);
      }
    });
  }
});

describe("isCounted", () => {
  it("counts only active, confirmed, non-void transactions", () => {
    expect(isCounted({ state: "active", confirmed: true, status: "cleared" })).toBe(true);
    expect(isCounted({ state: "active", confirmed: false, status: "uncleared" })).toBe(false);
    expect(isCounted({ state: "active", confirmed: true, status: "void" })).toBe(false);
    expect(isCounted({ state: "deleted", confirmed: true, status: "uncleared" })).toBe(false);
  });
});
