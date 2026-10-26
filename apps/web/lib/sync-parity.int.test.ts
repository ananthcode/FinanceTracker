import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { currentBalance, mergeFields } from "@ft/core";
import balances from "../../../packages/core/test/vectors/balances.json";
import merge from "../../../packages/core/test/vectors/merge.json";
import { testAdmin } from "@/test/fixtures";
import { newMember } from "@/test/sync";

/**
 * Parity (research R2-02, R2-07; constitution VII): the shared test vectors run against the SQL
 * twins of the TypeScript rules, so web, Android and the database cannot drift apart.
 */
describe("SQL parity with packages/core", () => {
  it("app.merge_field_versions decides every merge vector like mergeFields", async () => {
    const db = testAdmin();
    for (const c of merge.cases) {
      const { data, error } = await db.schema("app").rpc("merge_field_versions", {
        p_versions: c.fieldVersions,
        p_fields: c.fields,
        p_hlc: c.hlc,
        p_received_at: new Date(c.receivedAt).toISOString(),
      });
      expect(error, c.name).toBeNull();
      const sql = data as { applied: string[]; ignored: string[]; fieldVersions: Record<string, string>; clamped: boolean };
      const ts = mergeFields(c.fieldVersions as Record<string, string>, { fields: c.fields, hlc: c.hlc }, c.receivedAt);
      expect({ applied: sql.applied, ignored: sql.ignored, clamped: sql.clamped, after: sql.fieldVersions }, c.name).toEqual({
        applied: ts.applied,
        ignored: ts.ignored,
        clamped: ts.clamped,
        after: ts.fieldVersions,
      });
    }
  });

  it("app.account_balance_minor equals currentBalance for every vector account", async () => {
    const db = testAdmin();
    const m = await newMember("parity");
    // Vectors without movements: the SQL balance has no transactions before R4.
    interface VectorAccount {
      type: string;
      openingBalanceMinor: string;
      openingBalanceDate: string;
      state: string;
      creditLimitMinor: string | null;
    }
    const accounts: VectorAccount[] = balances.cases
      .filter((c) => c.movements.length === 0)
      .flatMap((c) => c.accounts as VectorAccount[]);
    for (const a of accounts) {
      const id = randomUUID();
      const { error } = await db.from("accounts").insert({
        id, user_id: m.id, name: `Parity ${id.slice(0, 8)}`, type: a.type, opening_balance_minor: a.openingBalanceMinor,
        opening_balance_date: a.openingBalanceDate, currency: "INR", colour: "blue", icon: "bank", sort_key: "a0",
        state: a.state === "deleted" ? "active" : a.state, include_in_net_worth: true, group_id: null, notes: null,
        credit_limit_minor: a.creditLimitMinor,
      });
      expect(error).toBeNull();
      const { data } = await db.schema("app").rpc("account_balance_minor", { p_account: id });
      const ts = currentBalance({ id, openingBalanceMinor: BigInt(a.openingBalanceMinor), openingBalanceDate: a.openingBalanceDate });
      expect(BigInt(String(data))).toBe(ts);
    }
  });
});
