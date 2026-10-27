import { describe, expect, it } from "vitest";
import { availableCredit, balanceLabel, currentBalance, summarise, type AccountForSummary, type Movement } from "../src/accounts";
import vectors from "./vectors/balances.json";

/** T008 — balances and net worth over the shared vectors (FR-006, FR-012–FR-019, FR-022; SC-002). */
type VectorAccount = (typeof vectors.cases)[number]["accounts"][number];

function toAccount(a: VectorAccount): AccountForSummary {
  return {
    id: a.id,
    type: a.type as AccountForSummary["type"],
    openingBalanceMinor: BigInt(a.openingBalanceMinor),
    openingBalanceDate: a.openingBalanceDate,
    state: a.state as AccountForSummary["state"],
    includeInNetWorth: a.includeInNetWorth,
    groupId: a.groupId,
    sortKey: a.sortKey,
    creditLimitMinor: a.creditLimitMinor === null ? null : BigInt(a.creditLimitMinor),
  };
}

describe("summarise (shared vectors)", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const accounts = c.accounts.map(toAccount);
      const movements: Movement[] = c.movements.map((m) => ({ ...m, amountMinor: BigInt(m.amountMinor) }));
      const s = summarise(accounts, {
        view: c.view as "by_type" | "my_groups",
        groups: c.groups.map((g) => ({ ...g, state: g.state as "active" | "deleted" })),
        movements,
      });
      const e = c.expect;

      expect(s.owned).toBe(BigInt(e.owned));
      expect(s.owed).toBe(BigInt(e.owed));
      expect(s.netWorth).toBe(BigInt(e.netWorth));
      expect(s.netWorth).toBe(s.owned - s.owed);

      expect(
        s.sections.map((sec) => ({
          key: sec.key,
          subtotal: sec.subtotal.toString(),
          subtotalKind: sec.subtotalKind,
          accounts: sec.rows.map((r) => r.account.id),
        })),
      ).toEqual(e.sections);
      expect(s.archived.map((r) => r.account.id)).toEqual(e.archived);

      const rows = [...s.sections.flatMap((sec) => sec.rows), ...s.archived];
      const labels = Object.fromEntries(rows.filter((r) => r.label).map((r) => [r.account.id, r.label]));
      expect(labels).toEqual(e.labels);
      expect(rows.filter((r) => r.excluded).map((r) => r.account.id)).toEqual(e.excluded);
      expect(rows.filter((r) => r.archivedWithBalance).map((r) => r.account.id)).toEqual(e.archivedWithBalance);
      const available = Object.fromEntries(
        rows
          .filter((r) => r.available)
          .map((r) => [
            r.account.id,
            { available: r.available!.available.toString(), overLimit: r.available!.overLimit, overBy: r.available!.overBy.toString() },
          ]),
      );
      expect(available).toEqual(e.available);
    });
  }

  it("switching views never changes Owned, Owed or Net worth (FR-017)", () => {
    for (const c of vectors.cases) {
      const accounts = c.accounts.map(toAccount);
      const groups = c.groups.map((g) => ({ ...g, state: g.state as "active" | "deleted" }));
      const movements: Movement[] = c.movements.map((m) => ({ ...m, amountMinor: BigInt(m.amountMinor) }));
      const byType = summarise(accounts, { view: "by_type", groups, movements });
      const mine = summarise(accounts, { view: "my_groups", groups, movements });
      expect([mine.owned, mine.owed, mine.netWorth]).toEqual([byType.owned, byType.owed, byType.netWorth]);
    }
  });
});

describe("currentBalance", () => {
  it("is the opening balance when there are no movements", () => {
    const a = toAccount(vectors.cases[0]!.accounts[0]!);
    expect(currentBalance(a)).toBe(5234050n);
    expect(currentBalance(a, [])).toBe(5234050n);
  });
});

describe("balanceLabel", () => {
  it("labels owed, in credit and overdrawn; zero has no label", () => {
    expect(balanceLabel("credit_card", 100n)).toBe("owed");
    expect(balanceLabel("credit_card", -100n)).toBe("in_credit");
    expect(balanceLabel("credit_card", 0n)).toBeNull();
    expect(balanceLabel("bank", -1n)).toBe("overdrawn");
    expect(balanceLabel("cash", -1n)).toBe("overdrawn");
    expect(balanceLabel("wallet", -1n)).toBe("overdrawn");
    expect(balanceLabel("bank", 0n)).toBeNull();
    expect(balanceLabel("bank", 1n)).toBeNull();
  });
});

describe("availableCredit", () => {
  it("is null without a limit or for non-card accounts", () => {
    expect(availableCredit({ type: "credit_card", creditLimitMinor: null }, 0n)).toBeNull();
    expect(availableCredit({ type: "bank", creditLimitMinor: 5000n }, 0n)).toBeNull();
  });

  it("includes a credit balance in what can be spent", () => {
    expect(availableCredit({ type: "credit_card", creditLimitMinor: 100000n }, -5000n)).toEqual({
      available: 105000n,
      overLimit: false,
      overBy: 0n,
    });
  });
});
