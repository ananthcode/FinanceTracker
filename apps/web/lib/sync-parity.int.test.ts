import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { currentBalance, mergeFields, personBalance } from "@ft/core";
import balances from "../../../packages/core/test/vectors/balances.json";
import merge from "../../../packages/core/test/vectors/merge.json";
import people from "../../../packages/core/test/vectors/people.json";
import transactions from "../../../packages/core/test/vectors/transactions.json";
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

  it("app.person_balance_minor equals personBalance for every people vector (R3 T045)", async () => {
    const db = testAdmin();
    const m = await newMember("parityppl");
    for (const c of people.cases) {
      for (const p of c.people) {
        const id = randomUUID();
        const { error } = await db.from("payees").insert({
          id, user_id: m.id, name: `Parity ${id.slice(0, 8)}`, kind: "person", opening_balance_minor: p.openingBalanceMinor,
          opening_balance_date: "2026-04-01", server_seq: 0,
        });
        expect(error, c.name).toBeNull();
        const { data } = await db.schema("app").rpc("person_balance_minor", { p_payee: id });
        expect(BigInt(String(data)), c.name).toBe(personBalance({ openingBalanceMinor: BigInt(p.openingBalanceMinor) }));
      }
    }
  });

  it("the postings trigger and balance functions agree with postingsOf for every transactions vector (R4 T020)", async () => {
    const db = testAdmin();
    for (const c of transactions.cases) {
      const m = await newMember("paritytx");
      // Vector ids are names; each run maps them to fresh uuids.
      const ids = new Map<string, string>();
      const uuid = (name: string | undefined) => (name === undefined ? null : (ids.get(name) ?? ids.set(name, randomUUID()).get(name)!));
      const insert = async (table: string, row: Record<string, unknown>) => {
        const { error } = await db.from(table).insert({ user_id: m.id, server_seq: 0, ...row });
        expect(error, `${c.name}: ${table}`).toBeNull();
      };
      for (const a of c.accounts) {
        await insert("accounts", {
          id: uuid(a.id), name: `Parity ${a.id}`, type: a.type, opening_balance_minor: a.openingBalanceMinor,
          opening_balance_date: a.openingBalanceDate, currency: "INR", colour: "blue", icon: "bank", sort_key: "a0",
        });
      }
      for (const p of c.people) {
        await insert("payees", { id: uuid(p.id), name: `Parity ${p.id}`, kind: "person", opening_balance_minor: p.openingBalanceMinor, opening_balance_date: "2026-04-01" });
      }
      const categoryKinds = new Map<string, "expense" | "income">();
      for (const t of c.transactions as VectorTx[]) {
        const kind = t.kind === "income" ? "income" : "expense";
        if (t.categoryId) categoryKinds.set(t.categoryId, kind);
        for (const l of t.lines ?? []) if (l.categoryId) categoryKinds.set(l.categoryId, kind);
      }
      for (const [name, kind] of categoryKinds) {
        await insert("categories", { id: uuid(name), name: `Parity ${name}`, kind, colour: "green", icon: "utensils" });
      }
      for (const t of c.transactions as VectorTx[]) {
        await insert("transactions", {
          id: uuid(t.id), date: t.date, kind: t.kind, flow: t.flow, account_id: uuid(t.accountId), to_account_id: uuid(t.toAccountId),
          amount_minor: t.amountMinor, payee_id: uuid(t.payeeId), person_action: t.personAction ?? null, category_id: uuid(t.categoryId),
          lines: (t.lines ?? []).map((l) => ({
            id: randomUUID(), amountMinor: l.amountMinor, categoryId: uuid(l.categoryId), personId: uuid(l.personId),
            personAction: l.personAction ?? null, notes: null, tagIds: [],
          })),
          status: t.status ?? "uncleared", confirmed: t.confirmed ?? true, state: t.state ?? "active",
          deleted_at: t.state === "deleted" ? new Date().toISOString() : null,
        });
      }

      const expected = c.expect as unknown as { accountBalances: Record<string, string>; personBalances: Record<string, string> };
      for (const a of c.accounts) {
        const { data, error } = await db.schema("app").rpc("account_balance_minor", { p_account: uuid(a.id) });
        expect(error).toBeNull();
        expect(String(data), `${c.name}: ${a.id}`).toBe(expected.accountBalances[a.id]);
      }
      for (const p of c.people) {
        const { data, error } = await db.schema("app").rpc("person_balance_minor", { p_payee: uuid(p.id) });
        expect(error).toBeNull();
        expect(String(data), `${c.name}: ${p.id}`).toBe(expected.personBalances[p.id]);
      }
    }
  });
});

interface VectorTx {
  id: string;
  date: string;
  kind: string;
  flow: string;
  accountId?: string;
  toAccountId?: string;
  amountMinor: string;
  payeeId?: string;
  personAction?: string;
  categoryId?: string;
  status?: string;
  confirmed?: boolean;
  state?: string;
  lines?: { amountMinor: string; categoryId?: string; personId?: string; personAction?: string }[];
}
