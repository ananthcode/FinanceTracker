import { describe, expect, it } from "vitest";
import { testAdmin } from "@/test/fixtures";
import { bearerRequest, newMember } from "@/test/sync";
import { GET as getMe } from "./route";
import { PATCH as patchPreferences } from "./preferences/route";

/** T046 — the accounts view preference follows the user to every device (FR-009, R2-12). */
const BASE = "http://localhost:3000/api/me";

describe("accountsView preference", () => {
  it("defaults to by_type, is stored, returned by GET /api/me and audited", async () => {
    const m = await newMember("view");
    const before = (await (await getMe(bearerRequest(BASE, m.token))).json()) as { preferences: { accountsView: string } };
    expect(before.preferences.accountsView).toBe("by_type");

    const res = await patchPreferences(bearerRequest(`${BASE}/preferences`, m.token, "PATCH", { accountsView: "my_groups" }));
    expect(res.status).toBe(200);

    const after = (await (await getMe(bearerRequest(BASE, m.token))).json()) as { preferences: { accountsView: string } };
    expect(after.preferences.accountsView).toBe("my_groups");

    const { data } = await testAdmin()
      .from("audit_events")
      .select("details")
      .eq("action", "preference_changed")
      .eq("target_id", m.id)
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect((data!.details as { changes: Record<string, unknown> }).changes).toHaveProperty("accounts_view");
  });

  it("refuses an unknown view", async () => {
    const m = await newMember("view");
    const res = await patchPreferences(bearerRequest(`${BASE}/preferences`, m.token, "PATCH", { accountsView: "by_colour" }));
    expect(res.status).toBe(400);
  });
});
