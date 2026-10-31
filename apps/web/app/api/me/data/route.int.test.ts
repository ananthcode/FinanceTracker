import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES, demoTransactions, todayInZone, type PullResponse } from "@ft/core";
import { publicEnv } from "@/lib/env";
import { testAdmin } from "@/test/fixtures";
import { accountFields, bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";
import { GET as pull } from "../../sync/pull/route";
import { POST as push } from "../../sync/push/route";
import { GET, POST } from "./route";

/** R5 T008, T014 — /api/me/data (contracts/http-api.md) and the reset point through the sync routes. */
const URL = "http://localhost:3000/api/me/data";
const SYNC = "http://localhost:3000/api/sync";

const status = async (m: TestMember) => (await (await GET(bearerRequest(URL, m.token))).json()) as { empty: boolean; demoAvailable: boolean };
const post = (m: TestMember, body: unknown) => POST(bearerRequest(URL, m.token, "POST", body));

/** Each account's balance by name, through the service-role balance function. */
async function balances(m: TestMember): Promise<Record<string, string>> {
  const db = testAdmin();
  const { data } = await db.from("accounts").select("id, name").eq("user_id", m.id);
  const out: Record<string, string> = {};
  for (const a of data as { id: string; name: string }[]) {
    const { data: b } = await db.schema("app").rpc("account_balance_minor", { p_account: a.id });
    out[a.name] = String(b);
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe("/api/me/data", () => {
  it("loads the demo household into empty data, the same for every user on the same day (US1 1–2, SC-002)", async () => {
    const [a, b] = [await newMember("demoa"), await newMember("demob")];
    expect(await status(a)).toEqual({ empty: true, demoAvailable: true });
    const started = Date.now();
    const res = await post(a, { action: "load" });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(10_000); // SC-001 (server part)
    const { loaded } = (await res.json()) as { loaded: Record<string, number> };
    const today = todayInZone(DEFAULT_PREFERENCES.timezone);
    expect(loaded).toMatchObject({ account: 8, account_group: 2, tag: 5, payee: 13, person_rate: 2, transaction: demoTransactions(today).transactions.length });
    expect((await status(a)).empty).toBe(false);

    expect((await post(b, { action: "load" })).status).toBe(200);
    expect(await balances(b)).toEqual(await balances(a));
  }, 60_000);

  it("refuses a second load, and loads once when asked twice at the same moment (US1 4, 6; FR-004)", async () => {
    const m = await newMember("demotwice");
    const [first, second] = await Promise.all([post(m, { action: "load" }), post(m, { action: "load" })]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const refused = first.status === 409 ? first : second;
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("NOT_EMPTY");
    const { count } = await testAdmin().from("accounts").select("id", { count: "exact", head: true }).eq("user_id", m.id);
    expect(count).toBe(8);
  }, 60_000);

  it("loads only in the demo environment; reset works anywhere (research R5-04)", async () => {
    const m = await newMember("demolive");
    vi.spyOn(publicEnv, "appEnv", "get").mockReturnValue("live");
    expect((await status(m)).demoAvailable).toBe(false);
    const res = await post(m, { action: "load" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_AVAILABLE");
    expect((await post(m, { action: "reset", confirm: "RESET" })).status).toBe(200);
  });

  it("resets only with the typed word; then the data is empty (US2 1–2, FR-009)", async () => {
    const m = await newMember("demoreset");
    await post(m, { action: "load" });
    expect((await post(m, { action: "reset" })).status).toBe(400);
    expect((await post(m, { action: "reset", confirm: "reset" })).status).toBe(400);
    const res = await post(m, { action: "reset", confirm: "RESET" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { removed: Record<string, number> }).removed).toMatchObject({ accounts: 8, groups: 2 });
    expect((await status(m)).empty).toBe(true);
  }, 60_000);

  it("resets and loads in one step (US3 1)", async () => {
    const m = await newMember("demoreload");
    const own = await push(bearerRequest(`${SYNC}/push`, m.token, "POST", { device: "android", changes: [new FakeDevice().change("account", crypto.randomUUID(), "create", accountFields("My own"))] }));
    expect(((await own.json()) as { results: { status: string; code?: string }[] }).results[0]).toMatchObject({ status: "applied" });
    const res = await post(m, { action: "reset_and_load", confirm: "RESET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removed: Record<string, number>; loaded: Record<string, number> };
    expect(body.removed.accounts).toBe(1);
    expect(body.loaded.account).toBe(8);
    const { data } = await testAdmin().from("accounts").select("name").eq("user_id", m.id).eq("name", "My own");
    expect(data).toEqual([]);
  }, 60_000);

  it("resets 20,000 transactions within 10 seconds (SC-003)", async () => {
    const m = await newMember("demobig");
    await post(m, { action: "load" });
    const db = testAdmin();
    const { data: account } = await db.from("accounts").select("id").eq("user_id", m.id).eq("name", "Everyday Savings").single();
    const rows = Array.from({ length: 20_000 }, (_, i) => ({
      id: crypto.randomUUID(), user_id: m.id, date: "2026-06-15", kind: "expense", flow: "out", account_id: account!.id,
      amount_minor: String(100 + i), server_seq: 0,
    }));
    for (let i = 0; i < rows.length; i += 2000) {
      const { error } = await db.from("transactions").insert(rows.slice(i, i + 2000));
      expect(error).toBeNull();
    }
    const started = Date.now();
    const res = await post(m, { action: "reset", confirm: "RESET" });
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(10_000);
    expect((await status(m)).empty).toBe(true);
  }, 300_000);

  it("other devices start over after a reset and their older changes are refused (US2 5, FR-012)", async () => {
    const m = await newMember("demodevices");
    const phone = new FakeDevice();
    const before = phone.change("account", crypto.randomUUID(), "create", accountFields("Offline before"), {}, Date.now() - 60_000);
    await push(bearerRequest(`${SYNC}/push`, m.token, "POST", { device: "android", changes: [phone.change("account", crypto.randomUUID(), "create", accountFields("Synced"))] }));
    const first = (await (await pull(bearerRequest(`${SYNC}/pull?cursor=0`, m.token))).json()) as PullResponse;
    expect(first.rows.account).toHaveLength(1);

    await post(m, { action: "reset", confirm: "RESET" });
    const again = (await (await pull(bearerRequest(`${SYNC}/pull?cursor=${first.cursor}`, m.token))).json()) as PullResponse;
    expect(again).toMatchObject({ reset: true, cursor: "0" });
    const results = (await (await push(bearerRequest(`${SYNC}/push`, m.token, "POST", { device: "android", changes: [before] }))).json()) as {
      results: { status: string; code?: string }[];
    };
    expect(results.results[0]).toMatchObject({ status: "rejected", code: "DATA_RESET" });
  });
});
