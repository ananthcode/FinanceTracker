import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { listPayees } from "@ft/db";
import { testAdmin } from "@/test/fixtures";
import { newMember } from "@/test/sync";

/**
 * R3 — the API returns at most 1,000 rows per request, but a user may have up to 2,000 payees
 * (FR-015): the repository must read every page. Found by the SC-002 performance test.
 */
describe("listPayees", () => {
  it("returns every payee beyond the 1,000-row page limit, through the user's own client", async () => {
    const m = await newMember("manypayees");
    const rows = Array.from({ length: 1050 }, (_, i) => ({
      id: randomUUID(), user_id: m.id, name: `Bulk payee ${i + 1}`, kind: "business", default_category_id: null, notes: null,
      hidden: false, opening_balance_minor: "0", opening_balance_date: null, include_in_net_worth: false,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await testAdmin().from("payees").insert(rows.slice(i, i + 500));
      expect(error).toBeNull();
    }
    const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${m.token}` } },
      auth: { persistSession: false },
    });
    const payees = await listPayees(asUser);
    expect(payees).toHaveLength(1050);
    expect(new Set(payees.map((p) => p.id)).size).toBe(1050);
  });
});
