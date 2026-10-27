import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPES, AccountCreateFields, balanceLabel, summarise } from "../src/accounts";
import { demoAccounts } from "../src/demo/accounts";

/** T066 — the deterministic demo account set (constitution X). */
describe("demoAccounts", () => {
  it("is deterministic", () => {
    expect(demoAccounts()).toEqual(demoAccounts());
  });

  it("is valid account data", () => {
    for (const a of demoAccounts().accounts) {
      const parsed = AccountCreateFields.safeParse({
        name: a.name,
        type: a.type,
        openingBalanceMinor: a.openingBalanceMinor.toString(),
        openingBalanceDate: a.openingBalanceDate,
        colour: a.colour,
        icon: a.icon,
        sortKey: a.sortKey,
        groupId: a.groupId,
        includeInNetWorth: a.includeInNetWorth,
        notes: a.notes,
        creditLimitMinor: a.creditLimitMinor === null ? null : a.creditLimitMinor.toString(),
      });
      expect(parsed.success, a.name).toBe(true);
    }
    const names = demoAccounts().accounts.map((a) => a.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("exercises every type, label and state the accounts screen can show", () => {
    const { accounts, groups } = demoAccounts();
    expect(new Set(accounts.map((a) => a.type))).toEqual(new Set(ACCOUNT_TYPES));
    const labels = new Set(accounts.map((a) => balanceLabel(a.type, a.openingBalanceMinor)));
    for (const label of ["owed", "in_credit", "overdrawn"]) expect(labels).toContain(label);
    expect(accounts.some((a) => a.creditLimitMinor !== null)).toBe(true);
    expect(accounts.some((a) => !a.includeInNetWorth)).toBe(true);
    expect(accounts.some((a) => a.state === "archived" && a.openingBalanceMinor === 0n)).toBe(true);
    expect(groups).toHaveLength(2);
    expect(accounts.some((a) => a.groupId === null && a.state === "active")).toBe(true);

    const summary = summarise(accounts, { view: "my_groups", groups });
    expect(summary.sections.map((s) => s.key)).toEqual([groups[0]!.id, groups[1]!.id, "ungrouped"]);
    expect(summary.sections[0]!.subtotalKind).toBe("net");
  });
});
