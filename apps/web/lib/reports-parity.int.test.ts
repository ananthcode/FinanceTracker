import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { categoryPayeeTotals as coreTotals, monthTotalsOf, type TotalRow } from "@ft/core";
import { categoryPayeeTotals, monthTotals, searchTransactions } from "@ft/db";
import reports from "../../../packages/core/test/vectors/reports.json";
import { toTransaction } from "../../../packages/core/test/postings.test";
import { testAdmin } from "@/test/fixtures";
import { newMember } from "@/test/sync";

/**
 * R6 T008 — the report readers equal core over the shared vectors (constitution VII), and the last
 * drill level's search returns exactly the transactions behind a payee's total (research R6-03).
 */
type VectorTx = Parameters<typeof toTransaction>[0] & Record<string, unknown>;

describe("report readers vs core", () => {
  it("app.category_payee_totals and app.month_totals equal core for the reports vectors", async () => {
    const db = testAdmin();
    const m = await newMember("parityrpt");
    const ids = new Map<string, string>();
    const uuid = (name: unknown) => (typeof name === "string" ? (ids.get(name) ?? ids.set(name, randomUUID()).get(name)!) : null);
    const insert = async (table: string, row: Record<string, unknown>) => {
      const { error } = await db.from(table).insert({ user_id: m.id, server_seq: 0, ...row });
      expect(error, table).toBeNull();
    };
    for (const a of reports.accounts) {
      await insert("accounts", { id: uuid(a.id), name: `Rpt ${a.id}`, type: a.type, opening_balance_minor: "0", opening_balance_date: "2026-01-01",
        currency: "INR", colour: "blue", icon: "bank", sort_key: "a0" });
    }
    for (const c of reports.categories) {
      await insert("categories", { id: uuid(c.id), name: `Rpt ${c.name}`, kind: c.kind, parent_id: uuid(c.parentId), colour: "green", icon: "utensils" });
    }
    for (const p of reports.payees) {
      await insert("payees", { id: uuid(p.id), name: `Rpt ${p.id}`, kind: p.kind, ...(p.kind === "person" ? { opening_balance_date: "2026-01-01" } : {}) });
    }
    for (const t of reports.transactions as VectorTx[]) {
      await insert("transactions", {
        id: uuid(t.id), date: t.date, kind: t.kind, flow: t.flow, account_id: uuid(t.accountId), to_account_id: uuid(t.toAccountId),
        amount_minor: t.amountMinor, payee_id: uuid(t.payeeId), person_action: t.personAction ?? null, category_id: uuid(t.categoryId),
        lines: ((t.lines as Record<string, unknown>[] | undefined) ?? []).map((l) => ({
          id: randomUUID(), amountMinor: l.amountMinor, categoryId: uuid(l.categoryId), personId: uuid(l.personId),
          personAction: l.personAction ?? null, notes: null, tagIds: [],
        })),
        status: t.status ?? "uncleared", confirmed: t.confirmed ?? true, state: t.state ?? "active",
        deleted_at: t.state === "deleted" ? new Date().toISOString() : null,
      });
    }
    const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${m.token}` } },
      auth: { persistSession: false },
    });
    const name = new Map([...ids].map(([k, v]) => [v, k]));
    const byName = (rows: TotalRow[]) =>
      rows.map((r) => `${r.kind}|${r.categoryId ? name.get(r.categoryId) : "-"}|${r.payeeId ? name.get(r.payeeId) : "-"}|${r.totalMinor}`).sort();

    const vectorTx = (reports.transactions as VectorTx[]).map(toTransaction);
    const fromCore = coreTotals(vectorTx, reports.period).map((r) => `${r.kind}|${r.categoryId ?? "-"}|${r.payeeId ?? "-"}|${r.totalMinor}`).sort();
    expect(byName(await categoryPayeeTotals(asUser, reports.period))).toEqual(fromCore);

    const monthsPeriod = reports.expect.monthsPeriod;
    expect(await monthTotals(asUser, monthsPeriod)).toEqual(monthTotalsOf(vectorTx, monthsPeriod));

    // The last drill level: Groceries (itself) with Fresh Mart → exactly t1, t2 and the refund t3.
    const page = await searchTransactions(asUser, { categoryId: uuid("groceries")!, categoryExact: true, payeeId: uuid("shop")!, ...reports.period });
    expect(page.rows.map((r) => name.get(r.id)).sort()).toEqual(["t1", "t2", "t3"]);
    // Food itself with no payee → t4.
    const own = await searchTransactions(asUser, { categoryId: uuid("food")!, categoryExact: true, payeeId: "none", ...reports.period });
    expect(own.rows.map((r) => name.get(r.id))).toEqual(["t4"]);
  });
});
