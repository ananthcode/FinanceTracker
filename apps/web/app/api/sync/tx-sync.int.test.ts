import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeInput, PullResponse } from "@ft/core";
import { accountFields, bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";
import { POST as push } from "./push/route";
import { GET as pull } from "./pull/route";

/**
 * R4 T019, T052 — transactions through the R2 sync endpoints with simulated Android devices
 * (contracts/sync-protocol.md; FR-012, FR-022, FR-023; SC-008 server side).
 */
const BASE = "http://localhost:3000/api/sync";

async function pushAs(m: TestMember, changes: ChangeInput[]) {
  const res = await push(bearerRequest(`${BASE}/push`, m.token, "POST", { device: "android", changes }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { status: string; code?: string; appliedFields: string[]; ignoredFields: string[] }[] }).results;
}

async function pullRows(m: TestMember): Promise<PullResponse["rows"]> {
  const res = await pull(bearerRequest(`${BASE}/pull?cursor=0`, m.token));
  expect(res.status).toBe(200);
  return ((await res.json()) as PullResponse).rows;
}

/** A member with a bank account and two expense categories; returns their ids. */
async function world(m: TestMember, d: FakeDevice) {
  const [bank, food, fuel] = [randomUUID(), randomUUID(), randomUUID()];
  await pushAs(m, [
    d.change("account", bank, "create", accountFields("Everyday Savings", { openingBalanceMinor: "10000000" })),
    d.change("category", food, "create", { name: "Food", kind: "expense", colour: "green", icon: "utensils" }),
    d.change("category", fuel, "create", { name: "Fuel", kind: "expense", colour: "amber", icon: "fuel" }),
  ]);
  return { bank, food, fuel };
}

const expense = (accountId: string, amountMinor: string, extra: Record<string, unknown> = {}) => ({
  kind: "expense",
  date: "2026-10-05",
  accountId,
  amountMinor,
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe("transactions through push and pull", () => {
  it("pushes a transaction and pulls it back with money as strings and no owner id", async () => {
    const m = await newMember("txsync");
    const d = new FakeDevice();
    const w = await world(m, d);
    const id = randomUUID();
    expect((await pushAs(m, [d.change("transaction", id, "create", expense(w.bank, "123450", { categoryId: w.food }))]))[0]!.status).toBe("applied");
    const rows = await pullRows(m);
    expect(rows.transaction).toHaveLength(1);
    expect(rows.transaction[0]).toMatchObject({ id, kind: "expense", amountMinor: "123450", categoryId: w.food, confirmed: true });
    expect(rows.transaction[0]).not.toHaveProperty("userId");
  });

  it("applies a transaction delivered twice once", async () => {
    const m = await newMember("txdupe");
    const d = new FakeDevice();
    const w = await world(m, d);
    const batch = [d.change("transaction", randomUUID(), "create", expense(w.bank, "5000"))];
    await pushAs(m, batch);
    expect((await pushAs(m, batch))[0]!.status).toBe("duplicate");
    expect((await pullRows(m)).transaction).toHaveLength(1);
  });

  it("keeps amount and split lines together when two devices edit them offline (FR-012, FR-023)", async () => {
    const m = await newMember("txsplit");
    const [phone, tablet] = [new FakeDevice(), new FakeDevice()];
    const w = await world(m, new FakeDevice()); // its own clock: the phone's must not run ahead of `t`
    const id = randomUUID();
    const t = Date.now() - 60_000;
    await pushAs(m, [phone.change("transaction", id, "create", expense(w.bank, "300000", { categoryId: w.food }), {}, t)]);
    // Offline: the tablet splits ₹3,000 into two lines; later the phone changes the amount to ₹2,800 unsplit and the notes.
    const tabletSplit = tablet.change("transaction", id, "update", {
      amountMinor: "300000",
      categoryId: null,
      lines: [
        { id: randomUUID(), amountMinor: "200000", categoryId: w.food },
        { id: randomUUID(), amountMinor: "100000", categoryId: w.fuel },
      ],
      notes: "Split on the tablet",
    }, {}, t + 10_000);
    const phoneAmount = phone.change("transaction", id, "update", { amountMinor: "280000", lines: [] }, {}, t + 20_000);
    await pushAs(m, [phoneAmount]);
    const results = await pushAs(m, [tabletSplit]);
    // The older split loses on the amount and its lines together; its other fields still apply.
    expect(results[0]).toMatchObject({ status: "applied" });
    expect(results[0]!.ignoredFields).toContain("amountMinor");
    const row = (await pullRows(m)).transaction[0] as Record<string, unknown>;
    expect(row).toMatchObject({ amountMinor: "280000", lines: [], notes: "Split on the tablet" });
  });

  it("rejects another user's account and logs no amounts or notes (FR-022)", async () => {
    const a = await newMember("txa");
    const b = await newMember("txb");
    const wb = await world(b, new FakeDevice());
    const spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const results = await pushAs(a, [new FakeDevice().change("transaction", randomUUID(), "create", expense(wb.bank, "777777", { notes: "Secret note" }))]);
    expect(results[0]).toMatchObject({ status: "rejected", code: "VALIDATION_FAILED" });
    const logged = spies.flatMap((s) => s.mock.calls.flat().map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
    expect(logged.join(" ")).not.toMatch(/777777|Secret note/);
  });

  it("50 offline changes from two devices: none lost or duplicated (SC-008 server side)", async () => {
    const m = await newMember("tx50");
    const [a, b] = [new FakeDevice(), new FakeDevice()];
    const w = await world(m, a);
    const ids = Array.from({ length: 25 }, () => randomUUID());
    const fromA = ids.map((id, i) => a.change("transaction", id, "create", expense(w.bank, String(1000 + i))));
    // B edits later: a second ahead, so a same-millisecond clock tie can't hand the notes to A.
    const later = Date.now() + 1_000;
    const fromB = ids.map((id, i) => b.change("transaction", id, "update", { notes: `B note ${i}` }, {}, later));
    await pushAs(m, fromA);
    await pushAs(m, fromB);
    await pushAs(m, fromA); // a retry of the first batch
    const rows = (await pullRows(m)).transaction as Record<string, unknown>[];
    expect(rows).toHaveLength(25);
    expect(rows.every((r) => String(r.notes).startsWith("B note"))).toBe(true);
  });
});
