import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeInput, PullResponse } from "@ft/core";
import { bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";
import { POST as push } from "./push/route";
import { GET as pull } from "./pull/route";

/**
 * R3 T019, T069 — categories, tags and payees through the R2 sync endpoints with simulated Android
 * devices (R3 contracts/sync-protocol.md; FR-029, FR-031–FR-033; SC-009 server side).
 */
const BASE = "http://localhost:3000/api/sync";

async function pushAs(m: TestMember, changes: ChangeInput[]) {
  const res = await push(bearerRequest(`${BASE}/push`, m.token, "POST", { device: "android", changes }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { status: string; renamedTo?: string; code?: string; appliedFields: string[] }[] })
    .results;
}

async function pullRows(m: TestMember): Promise<PullResponse["rows"]> {
  const res = await pull(bearerRequest(`${BASE}/pull?cursor=0`, m.token));
  expect(res.status).toBe(200);
  return ((await res.json()) as PullResponse).rows;
}

const category = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind: "expense",
  colour: "green",
  icon: "shopping-cart",
  ...extra,
});
const suffix = { options: { onNameConflict: "suffix" as const } };

afterEach(() => vi.restoreAllMocks());

describe("R3 entities through push and pull", () => {
  it("pushes a category, a tag and a person and pulls them back with field versions and money as strings", async () => {
    const m = await newMember("lists");
    const other = await newMember("listsother");
    const d = new FakeDevice();
    const [cat, tag, ravi] = [randomUUID(), randomUUID(), randomUUID()];
    const results = await pushAs(m, [
      d.change("category", cat, "create", category("Groceries")),
      d.change("tag", tag, "create", { name: "Goa trip" }),
      d.change("payee", ravi, "create", {
        name: "Ravi Kumar",
        kind: "person",
        openingBalanceMinor: "1500000",
        openingBalanceDate: "2026-04-01",
        defaultCategoryId: cat,
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    await pushAs(other, [new FakeDevice().change("payee", randomUUID(), "create", { name: "Someone else", kind: "business" })]);

    const rows = await pullRows(m);
    expect(rows.category).toHaveLength(1);
    expect(rows.tag).toHaveLength(1);
    expect(rows.payee).toHaveLength(1);
    expect(rows.payee[0]).toMatchObject({
      id: ravi,
      name: "Ravi Kumar",
      openingBalanceMinor: "1500000",
      defaultCategoryId: cat,
      state: "active",
    });
    expect(rows.payee[0]).not.toHaveProperty("userId");
    expect(Object.keys(rows.category[0]!.fieldVersions as Record<string, string>)).toContain("name");
  });

  it("logs no names, notes or balances when a push is refused (FR-029)", async () => {
    const m = await newMember("listslog");
    const spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const res = await push(
      bearerRequest(`${BASE}/push`, m.token, "POST", {
        device: "android",
        changes: [new FakeDevice().change("payee", randomUUID(), "create", { name: "Secret Lender", kind: "person", notes: "private note" })],
      }),
    );
    expect(res.status).toBe(400);
    const logged = spies.flatMap((s) => s.mock.calls.flat().map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
    expect(logged.join(" ")).not.toMatch(/Secret Lender|private note/);
  });
});

describe("R3 entities with two devices (T069)", () => {
  it("keeps same-named payees, tags and sibling categories created offline; the second is renamed", async () => {
    const m = await newMember("listsdupe");
    const [a, b] = [new FakeDevice(), new FakeDevice()];
    const parent = randomUUID();
    await pushAs(m, [a.change("category", parent, "create", category("Transport"))]);
    await pushAs(m, [
      a.change("payee", randomUUID(), "create", { name: "Corner Bakery", kind: "business" }, suffix),
      a.change("tag", randomUUID(), "create", { name: "Fuel" }, suffix),
      a.change("category", randomUUID(), "create", category("Fuel", { parentId: parent }), suffix),
    ]);
    const second = await pushAs(m, [
      b.change("payee", randomUUID(), "create", { name: "corner bakery", kind: "business" }, suffix),
      b.change("tag", randomUUID(), "create", { name: "Fuel" }, suffix),
      b.change("category", randomUUID(), "create", category("Fuel", { parentId: parent }), suffix),
    ]);
    expect(second.map((r) => r.renamedTo)).toEqual(["corner bakery (2)", "Fuel (2)", "Fuel (2)"]);
    const rows = await pullRows(m);
    expect(rows.payee).toHaveLength(2);
    expect(rows.tag).toHaveLength(2);
    expect(rows.category).toHaveLength(3);
  });

  it("combines offline edits to a payee per field; the later edit of the same field wins", async () => {
    const m = await newMember("listsmerge");
    const [phone, tablet] = [new FakeDevice(), new FakeDevice()];
    const id = randomUUID();
    const t = Date.now() - 60_000;
    await pushAs(m, [phone.change("payee", id, "create", { name: "Fresh Mart", kind: "business" }, {}, t)]);
    const older = tablet.change("payee", id, "update", { name: "Fresh Mart Ltd", notes: "Weekly" }, {}, t + 10_000);
    const newer = phone.change("payee", id, "update", { name: "FreshMart" }, {}, t + 20_000);
    await pushAs(m, [newer]);
    const results = await pushAs(m, [older]);
    expect(results[0]).toMatchObject({ status: "applied", appliedFields: ["notes"] });
    expect((await pullRows(m)).payee[0]).toMatchObject({ name: "FreshMart", notes: "Weekly" });
  });

  it("applies a merge pushed twice once, refuses later edits to the source and pulls every touched row", async () => {
    const m = await newMember("listsmerge2");
    const d = new FakeDevice();
    const [src, srcChild, tgt, payee] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await pushAs(m, [
      d.change("category", src, "create", category("Eating out")),
      d.change("category", srcChild, "create", category("Weekend", { parentId: src })),
      d.change("category", tgt, "create", category("Food delivery")),
      d.change("payee", payee, "create", { name: "Corner Cafe", kind: "business", defaultCategoryId: src }),
    ]);
    const cursor = ((await (await pull(bearerRequest(`${BASE}/pull?cursor=0`, m.token))).json()) as PullResponse).cursor;

    const merge = d.change("category", src, "merge", { targetId: tgt });
    expect((await pushAs(m, [merge]))[0]!.status).toBe("applied");
    expect((await pushAs(m, [merge]))[0]!.status).toBe("duplicate");
    expect((await pushAs(m, [d.change("category", src, "update", { name: "Late" })]))[0]).toMatchObject({
      status: "rejected",
      code: "NOT_FOUND",
    });

    const res = await pull(bearerRequest(`${BASE}/pull?cursor=${cursor}`, m.token));
    const after = ((await res.json()) as PullResponse).rows;
    expect(after.category.find((r) => r.id === src)).toMatchObject({ state: "deleted", mergedInto: tgt });
    expect(after.category.find((r) => r.id === srcChild)).toMatchObject({ parentId: tgt });
    expect(after.payee.find((r) => r.id === payee)).toMatchObject({ defaultCategoryId: tgt });
  });
});
