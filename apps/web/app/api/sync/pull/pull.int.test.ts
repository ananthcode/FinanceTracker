import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ChangeInput, PullResponse } from "@ft/core";
import { accountFields, bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";
import { POST as push } from "../push/route";
import { GET as pull } from "./route";

/**
 * T057 — sync server side with two simulated Android devices (contracts/sync-protocol.md;
 * FR-030–FR-032, SC-007 server side). The Android client itself comes in the Android phase.
 */
const BASE = "http://localhost:3000/api/sync";

async function pushAs(m: TestMember, changes: ChangeInput[]) {
  const res = await push(bearerRequest(`${BASE}/push`, m.token, "POST", { device: "android", changes }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { status: string; renamedTo?: string; code?: string }[] }).results;
}

async function pullAs(m: TestMember, cursor = "0", limit?: number): Promise<PullResponse> {
  const q = new URLSearchParams({ cursor, ...(limit ? { limit: String(limit) } : {}) });
  const res = await pull(bearerRequest(`${BASE}/pull?${q}`, m.token));
  expect(res.status).toBe(200);
  return (await res.json()) as PullResponse;
}

/** Pulls every page from a cursor; returns all rows and the final cursor. */
async function pullAll(m: TestMember, from = "0", limit = 2) {
  const rows: PullResponse["rows"]["account"] = [];
  let cursor = from;
  for (let i = 0; i < 100; i++) {
    const page = await pullAs(m, cursor, limit);
    rows.push(...page.rows.account, ...page.rows.account_group);
    cursor = page.cursor;
    if (!page.hasMore) break;
  }
  return { rows, cursor };
}

describe("sync pull + push with two devices", () => {
  it("combines offline edits per field; the later edit of the same field wins", async () => {
    const m = await newMember("twodev");
    const phone = new FakeDevice();
    const tablet = new FakeDevice();
    const id = randomUUID();
    const t = Date.now() - 60_000;
    await pushAs(m, [phone.change("account", id, "create", accountFields("Travel Card", { type: "credit_card", icon: "credit-card" }), {}, t)]);

    // Both offline: the tablet renames first (older) and recolours; the phone renames later.
    const tabletRename = tablet.change("account", id, "update", { name: "Holiday Card", colour: "teal" }, {}, t + 10_000);
    const phoneRename = phone.change("account", id, "update", { name: "Trips Card" }, {}, t + 20_000);
    // The later edit arrives first; the older one arrives after and must lose on "name" only.
    await pushAs(m, [phoneRename]);
    const results = await pushAs(m, [tabletRename]);
    expect(results[0]).toMatchObject({ status: "applied", appliedFields: ["colour"], ignoredFields: ["name"] });

    const row = (await pullAs(m)).rows.account.find((r) => r.id === id) as Record<string, unknown>;
    expect(row).toMatchObject({ name: "Trips Card", colour: "teal" });
  });

  it("applies a batch delivered twice exactly once", async () => {
    const m = await newMember("dupe");
    const device = new FakeDevice();
    const batch = [device.change("account", randomUUID(), "create", accountFields("Petrol cash", { type: "cash", icon: "fuel" }))];
    await pushAs(m, batch);
    const again = await pushAs(m, batch);
    expect(again[0]!.status).toBe("duplicate");
    expect((await pullAs(m)).rows.account).toHaveLength(1);
  });

  it("keeps both accounts created offline with the same name; the second is renamed (FR-032)", async () => {
    const m = await newMember("samename");
    const a = new FakeDevice();
    const b = new FakeDevice();
    const opts = { options: { onNameConflict: "suffix" as const } };
    await pushAs(m, [a.change("account", randomUUID(), "create", accountFields("Fuel", { type: "cash" }), opts)]);
    const second = await pushAs(m, [b.change("account", randomUUID(), "create", accountFields("Fuel", { type: "cash" }), opts)]);
    expect(second[0]).toMatchObject({ status: "renamed", renamedTo: "Fuel (2)" });
    expect((await pullAs(m)).rows.account.map((r) => r.name).sort()).toEqual(["Fuel", "Fuel (2)"]);
  });

  it("pages with hasMore and the cursor never skips or repeats rows, even when pushes interleave", async () => {
    const m = await newMember("cursor");
    const devices = [new FakeDevice(), new FakeDevice(), new FakeDevice()];
    const created: string[] = [];
    // Three devices push at the same time, several times each.
    await Promise.all(
      devices.map(async (d, n) => {
        for (let i = 0; i < 4; i++) {
          const id = randomUUID();
          created.push(id);
          await pushAs(m, [d.change("account", id, "create", accountFields(`Device ${n} account ${i}`))]);
        }
      }),
    );
    const first = await pullAll(m, "0", 5);
    expect(first.rows.map((r) => r.id).sort()).toEqual([...created].sort()); // every row exactly once

    // Later changes arrive after the cursor; nothing earlier is resent.
    const id = created[0]!;
    await pushAs(m, [devices[0]!.change("account", id, "update", { notes: "changed later" })]);
    const next = await pullAll(m, first.cursor, 5);
    expect(next.rows.map((r) => r.id)).toEqual([id]);
    expect(BigInt(next.cursor)).toBeGreaterThan(BigInt(first.cursor));
  });

  it("returns wire rows: camelCase, money as strings, field versions, never another user's rows", async () => {
    const m = await newMember("wire");
    const other = await newMember("wire-other");
    await pushAs(other, [new FakeDevice().change("account", randomUUID(), "create", accountFields("Theirs"))]);
    await pushAs(m, [new FakeDevice().change("account", randomUUID(), "create", accountFields("Mine", { openingBalanceMinor: "5234050" }))]);

    const page = await pullAs(m);
    expect(page.rows.account).toHaveLength(1);
    const row = page.rows.account[0] as Record<string, unknown>;
    expect(row).toMatchObject({ name: "Mine", openingBalanceMinor: "5234050", state: "active" });
    expect(typeof row.serverSeq).toBe("string");
    expect(row).toHaveProperty("fieldVersions.name");
    expect(row).not.toHaveProperty("userId");
    expect(row).not.toHaveProperty("user_id");
  });

  it("refuses a bad cursor", async () => {
    const m = await newMember("badcursor");
    const res = await pull(bearerRequest(`${BASE}/pull?cursor=-1`, m.token));
    expect(res.status).toBe(400);
  });
});
