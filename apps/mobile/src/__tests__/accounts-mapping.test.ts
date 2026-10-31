import { summarise } from "@ft/core";
import { applyLocally } from "@/lib/sync/engine";
import { accountFromRow } from "@/lib/sync/accounts";

/** R2 T062 — rows on the phone (synced or created offline) feed the shared summary unchanged. */
describe("accountFromRow", () => {
  it("maps a pulled row with money as strings", () => {
    const a = accountFromRow(
      { id: "a1", name: "Everyday Savings", type: "bank", openingBalanceMinor: "5234050", openingBalanceDate: "2026-04-01",
        currency: "INR", colour: "blue", icon: "bank", sortKey: "a0", groupId: null, includeInNetWorth: true, notes: null,
        creditLimitMinor: null, state: "active" },
      "INR",
    );
    expect(a).toMatchObject({ openingBalanceMinor: 5234050n, creditLimitMinor: null, currency: "INR" });
  });

  it("gives a row created offline the base currency and counts it in the summary", () => {
    const row = applyLocally(null, {
      changeId: "c1", entity: "account", entityId: "a2", kind: "create", hlc: "1793011200000.0000.phone0001",
      fields: { name: "Rewards Card", type: "credit_card", openingBalanceMinor: "1825000", openingBalanceDate: "2026-04-01",
        colour: "orange", icon: "credit-card", sortKey: "a1", creditLimitMinor: "5000000", includeInNetWorth: true },
    });
    const card = accountFromRow(row, "INR");
    expect(card).toMatchObject({ currency: "INR", creditLimitMinor: 5000000n, state: "active" });
    expect(summarise([card], { view: "by_type" })).toMatchObject({ owned: 0n, owed: 1825000n, netWorth: -1825000n });
  });
});
