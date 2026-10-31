import { describe, expect, it } from "vitest";
import { interestAmount, proposeInterest, rateFor, type InterestMode, type TransactionView } from "../src";
import vectors from "./vectors/interest.json";

/** R4 T034 — interest proposals over the shared vectors (FR-013 – FR-016; SC-007). */
type VectorTx = { id: string; date: string; kind: string; flow: string; amountMinor: string } & Record<string, unknown>;

export function vectorTransaction(t: VectorTx): TransactionView {
  return {
    id: t.id,
    date: t.date,
    timeOfDay: null,
    kind: t.kind as TransactionView["kind"],
    flow: t.flow as TransactionView["flow"],
    accountId: (t.accountId as string) ?? null,
    toAccountId: null,
    amountMinor: BigInt(t.amountMinor),
    payeeId: "p",
    personAction: (t.personAction as TransactionView["personAction"]) ?? null,
    categoryId: null,
    lines: [],
    tagIds: [],
    notes: null,
    reference: null,
    status: "uncleared",
    confirmed: (t.confirmed as boolean) ?? true,
    generated: (t.generated as boolean) ?? false,
    interestMonth: (t.interestMonth as string) ?? null,
    userEdited: (t.userEdited as boolean) ?? false,
    state: (t.state as "active" | "deleted") ?? "active",
  };
}

describe("interest vectors", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const person = {
        id: "p",
        openingBalanceMinor: BigInt(c.person.openingBalanceMinor),
        openingBalanceDate: c.person.openingBalanceDate,
        interestMode: c.person.interestMode as InterestMode,
      };
      const result = proposeInterest(person, c.rates, (c.transactions as VectorTx[]).map(vectorTransaction), c.today);
      expect(Object.fromEntries([...result.proposals].map(([m, e]) => [m, e.toString()]))).toEqual(c.expect.proposals);
      if (c.expect.actions) {
        expect(result.actions.map((a) => `${a.type} ${a.month} ${a.amountMinor} ${a.flow}`.replace(/ 0 (in|out)$/, ""))).toEqual(c.expect.actions);
      }
    });
  }

  it("gives the same result whatever order earlier proposals are confirmed in (SC-007)", () => {
    const c = vectors.cases[0]!;
    const person = { id: "p", openingBalanceMinor: 10000000n, openingBalanceDate: "2026-10-01", interestMode: "automatic" as const };
    const first = proposeInterest(person, c.rates, (c.transactions as VectorTx[]).map(vectorTransaction), c.today);
    // October confirmed now: November is unchanged.
    const october = vectorTransaction({ id: "oct", date: "2026-10-31", kind: "interest", flow: "out", amountMinor: "100000", generated: true, interestMonth: "2026-10-01", confirmed: true });
    const november = vectorTransaction({ id: "nov", date: "2026-11-30", kind: "interest", flow: "out", amountMinor: "106000", generated: true, interestMonth: "2026-11-01", confirmed: false });
    const again = proposeInterest(person, c.rates, [...(c.transactions as VectorTx[]).map(vectorTransaction), october, november], c.today);
    expect(again.actions).toEqual([]);
    expect(again.proposals).toEqual(first.proposals);
  });
});

describe("interestAmount and rateFor", () => {
  it("rounds half away from zero, exactly, at the largest amounts", () => {
    expect(interestAmount(999999999999n, 100000)).toBe(100000000000n); // 99,999,999,999.9 → 1,00,00,00,000.00
    expect(interestAmount(-5n, 100000)).toBe(-1n); // −0.5 → −1
    expect(interestAmount(4n, 100000)).toBe(0n); // 0.4 → 0
    expect(interestAmount(10000000n, 15000)).toBe(150000n);
  });

  it("uses the latest rate effective on or before the month", () => {
    const rates = [{ effectiveMonth: "2026-04-01", rateE4: 10000 }, { effectiveMonth: "2026-08-01", rateE4: 15000 }];
    expect(rateFor("2026-03-01", rates)).toBeNull();
    expect(rateFor("2026-07-01", rates)).toBe(10000);
    expect(rateFor("2026-08-01", rates)).toBe(15000);
  });
});
