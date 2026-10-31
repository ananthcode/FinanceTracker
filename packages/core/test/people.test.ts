import { describe, expect, it } from "vitest";
import { peopleTotals, personBalance, personLabel, PERSON_LABEL_TEXT } from "../src/people";
import vectors from "./vectors/people.json";

/** R3 T042 — person balances, labels and People totals (FR-016 – FR-019; SC-004). */
interface VectorPerson {
  id: string;
  openingBalanceMinor: string;
  hidden?: boolean;
}

const asPayee = (p: VectorPerson) => ({
  id: p.id,
  kind: "person" as const,
  openingBalanceMinor: BigInt(p.openingBalanceMinor),
  hidden: p.hidden ?? false,
});

describe("people vectors", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const people = (c.people as VectorPerson[]).map(asPayee);
      for (const p of people) {
        const expected = (c.expected.balances as Record<string, string>)[p.id]!;
        expect(personBalance(p)).toBe(BigInt(expected));
        expect(personLabel(personBalance(p))).toBe((c.expected.labels as Record<string, string>)[p.id]);
      }
      const totals = peopleTotals(people);
      expect(totals.owedToYou).toBe(BigInt(c.expected.owedToYou));
      expect(totals.youOwe).toBe(BigInt(c.expected.youOwe));
    });
  }
});

describe("people", () => {
  it("ignores businesses in the totals", () => {
    const totals = peopleTotals([
      { kind: "business", openingBalanceMinor: 0n },
      { kind: "person", openingBalanceMinor: 500n },
    ]);
    expect(totals).toEqual({ owedToYou: 500n, youOwe: 0n });
  });

  it("adds movements on or after the opening date (R4 supplies them)", () => {
    expect(personBalance({ openingBalanceMinor: 1000n }, [{ amountMinor: -400n }, { amountMinor: 50n }])).toBe(650n);
  });

  it("describes the direction in words", () => {
    expect(PERSON_LABEL_TEXT).toEqual({ owes_you: "owes you", you_owe: "you owe", settled: "settled" });
  });
});
