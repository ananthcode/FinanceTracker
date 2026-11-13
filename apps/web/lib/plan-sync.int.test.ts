import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addMonths, monthOf, occurrenceId, todayInZone, type ChangeInput, type PullResponse } from "@ft/core";
import { POST as push } from "@/app/api/sync/push/route";
import { GET as pull } from "@/app/api/sync/pull/route";
import { GET as getMe } from "@/app/api/me/route";
import { PATCH as patchPreferences } from "@/app/api/me/preferences/route";
import { testAdmin } from "@/test/fixtures";
import { accountFields, bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";

/**
 * R7 T015 — the plan through the R2 sync endpoints (contracts/sync-protocol.md), the SQL and
 * TypeScript occurrence ids agreeing, and the two plan preferences (contracts/http-api.md).
 */
const BASE = "http://localhost:3000/api";
const thisMonth = monthOf(todayInZone("Asia/Kolkata"));

async function pushAs(m: TestMember, changes: ChangeInput[]) {
  const res = await push(bearerRequest(`${BASE}/sync/push`, m.token, "POST", { device: "android", changes }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { status: string; code?: string; ignoredFields: string[] }[] }).results;
}

async function pullRows(m: TestMember): Promise<PullResponse["rows"]> {
  const res = await pull(bearerRequest(`${BASE}/sync/pull?cursor=0`, m.token));
  expect(res.status).toBe(200);
  return ((await res.json()) as PullResponse).rows;
}

async function world(m: TestMember, d: FakeDevice) {
  const [bank, landlord] = [randomUUID(), randomUUID()];
  await pushAs(m, [
    d.change("account", bank, "create", accountFields("Everyday Savings", { openingBalanceMinor: "10000000" })),
    d.change("payee", landlord, "create", { name: "Landlord", kind: "business" }, { options: { onNameConflict: "reject" } }),
  ]);
  return { bank, landlord };
}

const rentFields = (w: { bank: string; landlord: string }) => ({
  name: "Rent",
  target: "payee",
  payeeId: w.landlord,
  frequency: "monthly",
  intervalMonths: 1,
  startMonth: thisMonth,
  terms: [{ fromMonth: thisMonth, amountMinor: "2500000", dueDay: 5, accountId: w.bank }],
});

describe("the plan through push and pull", () => {
  it("pushes an item, a month and a link, and pulls them back with money as strings", async () => {
    const m = await newMember("plansync");
    const d = new FakeDevice();
    const w = await world(m, d);
    const item = randomUUID();
    const tx = randomUUID();
    const next = addMonths(thisMonth, 1);
    const results = await pushAs(m, [
      d.change("plan_item", item, "create", rentFields(w)),
      d.change("plan_occurrence", occurrenceId(item, next), "create", { itemId: item, month: next, amountMinor: "2600000" }),
      d.change("transaction", tx, "create", {
        kind: "expense", date: todayInZone("Asia/Kolkata"), accountId: w.bank, amountMinor: "2500000", payeeId: w.landlord,
        planItemId: item, planMonth: thisMonth,
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    const rows = await pullRows(m);
    expect(rows.plan_item[0]).toMatchObject({ id: item, name: "Rent", terms: [{ amountMinor: "2500000", dueDay: 5 }] });
    expect(rows.plan_item[0]).not.toHaveProperty("userId");
    expect(rows.plan_occurrence[0]).toMatchObject({ id: occurrenceId(item, next), itemId: item, month: next, amountMinor: "2600000", skipped: false });
    expect(rows.transaction[0]).toMatchObject({ id: tx, planItemId: item, planMonth: thisMonth });
  });

  it("two offline devices setting the same month write one row, merged per field (R7-02)", async () => {
    const m = await newMember("planmerge");
    const [phone, tablet] = [new FakeDevice(), new FakeDevice()];
    const w = await world(m, new FakeDevice());
    const item = randomUUID();
    await pushAs(m, [phone.change("plan_item", item, "create", rentFields(w))]);
    const next = addMonths(thisMonth, 1);
    const id = occurrenceId(item, next);
    const t = Date.now();
    await pushAs(m, [phone.change("plan_occurrence", id, "create", { itemId: item, month: next, amountMinor: "2700000" }, {}, t)]);
    await pushAs(m, [tablet.change("plan_occurrence", id, "create", { itemId: item, month: next, skipped: true }, {}, t + 1000)]);
    const rows = await pullRows(m);
    expect(rows.plan_occurrence).toHaveLength(1);
    expect(rows.plan_occurrence[0]).toMatchObject({ amountMinor: "2700000", skipped: true });
  });

  it("refuses a link from income before it reaches the database (the database refuses it too, pgTAP)", async () => {
    const m = await newMember("planlink");
    const d = new FakeDevice();
    const w = await world(m, d);
    const item = randomUUID();
    await pushAs(m, [d.change("plan_item", item, "create", rentFields(w))]);
    const change = d.change("transaction", randomUUID(), "create", {
      kind: "income", date: "2026-10-05", accountId: w.bank, amountMinor: "100", planItemId: item, planMonth: thisMonth,
    });
    const res = await push(bearerRequest(`${BASE}/sync/push`, m.token, "POST", { device: "android", changes: [change] }));
    expect(res.status).toBe(400);
  });
});

describe("occurrenceId: TypeScript and SQL agree (R7-02)", () => {
  it("on 50 random item-months", async () => {
    const admin = testAdmin();
    for (let i = 0; i < 50; i++) {
      const item = randomUUID();
      const month = addMonths("2000-01-01", Math.floor(Math.random() * 1500));
      const { data, error } = await admin.schema("app").rpc("_plan_occurrence_id", { p_item: item, p_month: month });
      expect(error).toBeNull();
      expect(data).toBe(occurrenceId(item, month));
    }
  });
});

describe("plan preferences (FR-023, contracts/http-api.md)", () => {
  it("default to reminding and nothing checked; the checked month only moves forward", async () => {
    const m = await newMember("plannudge");
    const me = async () => ((await (await getMe(bearerRequest(`${BASE}/me`, m.token))).json()) as { preferences: Record<string, unknown> }).preferences;
    expect(await me()).toMatchObject({ planNudge: true, planCheckedMonth: null });

    const next = addMonths(thisMonth, 1);
    const patch = (body: unknown) => patchPreferences(bearerRequest(`${BASE}/me/preferences`, m.token, "PATCH", body));
    expect((await patch({ planCheckedMonth: next })).status).toBe(200);
    expect((await patch({ planCheckedMonth: thisMonth })).status).toBe(200);
    expect(await me()).toMatchObject({ planCheckedMonth: next });

    expect((await patch({ planNudge: false })).status).toBe(200);
    expect(await me()).toMatchObject({ planNudge: false, planCheckedMonth: next });
    expect((await patch({ planCheckedMonth: "2026-11-15" })).status).toBe(400);
  });
});
