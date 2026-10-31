import { mergeFields, SYNC_ENTITIES, type ChangeInput, type ChangeResult, type PullResponse, type SyncEntity } from "@ft/core";
import { applyLocally, liveRows, SyncEngine } from "@/lib/sync/engine";
import { MemorySyncStore } from "@/lib/sync/memory-store";
import type { PushInput, SyncRow, SyncTransport } from "@/lib/sync/types";

/**
 * R2 T059 — the Android sync engine against a fake server that follows the protocol
 * (contracts/sync-protocol.md): per-field latest-edit-wins, idempotent change ids, " (n)" renames,
 * a business rule rejection, and a paged pull cursor. FR-030 – FR-034; SC-007 device side.
 */
class FakeServer implements SyncTransport {
  rows = new Map<string, SyncRow & { serverSeq: string }>();
  results = new Map<string, ChangeResult>();
  seq = 0;
  failNextPush = false;
  pageSize = 500;
  pushes = 0;

  private key(entity: SyncEntity, id: string) {
    return `${entity}:${id}`;
  }

  async push(request: PushInput): Promise<ChangeResult[]> {
    this.pushes += 1;
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error("You appear to be offline.");
    }
    return request.changes.map((c) => {
      const stored = this.results.get(c.changeId);
      if (stored) return { ...stored, status: "duplicate" as const };
      const result = this.apply(c as unknown as ChangeInput);
      this.results.set(c.changeId, result);
      return result;
    });
  }

  private apply(c: ChangeInput): ChangeResult {
    const base = { changeId: c.changeId, appliedFields: [] as string[], ignoredFields: [] as string[], clamped: false };
    const k = this.key(c.entity, c.entityId);
    const row = this.rows.get(k);
    const fields = (c.fields ?? {}) as Record<string, unknown>;
    if (c.kind === "create" && !row) {
      let name = fields.name as string;
      let status: ChangeResult["status"] = "applied";
      const taken = (n: string) =>
        [...this.rows.values()].some((r) => this.rows.get(this.key(c.entity, r.id)) === r && r.state !== "deleted" && String(r.name).toLowerCase() === n.toLowerCase());
      if (taken(name) && c.options?.onNameConflict === "suffix") {
        let n = 2;
        while (taken(`${name} (${n})`)) n++;
        name = `${name} (${n})`;
        status = "renamed";
      }
      const versions = Object.fromEntries(Object.keys(fields).map((f) => [f, c.hlc]));
      this.save(c.entity, { id: c.entityId, ...fields, name, state: "active", fieldVersions: { ...versions, state: c.hlc } });
      return { ...base, status, appliedFields: Object.keys(fields), ...(status === "renamed" ? { renamedTo: name } : {}) };
    }
    if (!row || row.state === "deleted") return { ...base, status: "rejected", code: "NOT_FOUND" };
    if (c.kind === "archive" && row.openingBalanceMinor !== "0") return { ...base, status: "rejected", code: "BALANCE_NOT_ZERO" };
    const names = c.kind === "create" || c.kind === "update" ? Object.keys(fields) : ["state"];
    const merge = mergeFields(row.fieldVersions as Record<string, string>, { fields: names, hlc: c.hlc }, Date.now());
    const next: SyncRow = { ...row, fieldVersions: merge.fieldVersions };
    for (const f of merge.applied) {
      if (f === "state") next.state = c.kind === "archive" ? "archived" : c.kind === "restore" ? "active" : "deleted";
      else next[f] = fields[f];
    }
    if (merge.applied.length) this.save(c.entity, next);
    return { ...base, status: "applied", appliedFields: merge.applied, ignoredFields: merge.ignored };
  }

  private save(entity: SyncEntity, row: SyncRow) {
    this.seq += 1;
    this.rows.set(this.key(entity, row.id), { ...row, serverSeq: String(this.seq), entity } as SyncRow & { serverSeq: string });
  }

  async pull(cursor: string): Promise<PullResponse> {
    const changed = [...this.rows.values()]
      .filter((r) => Number(r.serverSeq) > Number(cursor))
      .sort((a, b) => Number(a.serverSeq) - Number(b.serverSeq));
    const page = changed.slice(0, this.pageSize);
    const rows = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, [] as SyncRow[]])) as PullResponse["rows"];
    for (const r of page) {
      const { entity, ...wire } = r as unknown as SyncRow & { entity: SyncEntity };
      (rows[entity] as SyncRow[]).push(wire as SyncRow);
    }
    return { cursor: page.at(-1)?.serverSeq ?? cursor, hasMore: changed.length > page.length, rows };
  }

  /** An edit made on another device (e.g. the web), already applied server-side. */
  editElsewhere(entity: SyncEntity, id: string, fields: Record<string, unknown>, hlc: string) {
    return this.push({ device: "web", changes: [{ changeId: crypto.randomUUID(), entity, entityId: id, kind: "update", fields, hlc } as never] });
  }
}

const account = (name: string, opening = "0") => ({
  name,
  type: "cash",
  openingBalanceMinor: opening,
  openingBalanceDate: "2026-04-01",
  colour: "green",
  icon: "banknote",
  sortKey: "a0",
});

function setup(device = "phone0001") {
  const server = new FakeServer();
  const store = new MemorySyncStore();
  let clock = Date.UTC(2026, 9, 31, 6, 0, 0);
  const engine = new SyncEngine(store, server, device, () => (clock += 1000));
  return { server, store, engine };
}

describe("SyncEngine", () => {
  it("applies a local change at once and queues it in the same transaction", async () => {
    const { store, engine } = setup();
    const change = await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Petrol cash") });
    expect((await store.getRow("account", "a1"))?.name).toBe("Petrol cash");
    expect(await store.pendingCount()).toBe(1);
    expect(change.hlc).toMatch(/^\d{13}\.\d{4}\.phone0001$/);
  });

  it("rolls back the local write if queuing fails (no change without its outbox entry)", async () => {
    const { store, engine } = setup();
    jest.spyOn(store, "enqueue").mockRejectedValueOnce(new Error("disk full"));
    await expect(engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Lost") })).rejects.toThrow();
    expect(await store.getRow("account", "a1")).toBeNull();
    expect(await store.pendingCount()).toBe(0);
  });

  it("pushes then pulls; the outbox empties and the server row comes back", async () => {
    const { server, store, engine } = setup();
    await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Petrol cash") });
    const outcome = await engine.sync();
    expect(outcome).toMatchObject({ ok: true, pushed: 1, pulled: 1 });
    expect(await store.pendingCount()).toBe(0);
    expect((await store.getRow("account", "a1"))?.serverSeq).toBe("1");
    expect(server.rows.size).toBe(1);
  });

  it("keeps the outbox after a network failure and sends each change exactly once on retry", async () => {
    const { server, store, engine } = setup();
    await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Petrol cash") });
    server.failNextPush = true;
    const failed = await engine.sync();
    expect(failed.ok).toBe(false);
    expect(await store.pendingCount()).toBe(1);
    expect((await store.pending())[0]).toMatchObject({ attempts: 1, lastError: "You appear to be offline." });

    expect((await engine.sync()).ok).toBe(true);
    expect(await store.pendingCount()).toBe(0);
    expect(server.rows.size).toBe(1);
  });

  it("treats a duplicate result (a batch delivered twice) as done", async () => {
    const { server, store, engine } = setup();
    const change = await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Petrol cash") });
    await server.push({ device: "android", changes: [change as never] }); // delivered once already
    await engine.sync();
    expect(await store.pendingCount()).toBe(0);
    expect(server.rows.size).toBe(1);
  });

  it("re-applies unsent changes on top of a pulled row", async () => {
    const { server, store, engine } = setup();
    await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Rewards Card") });
    await engine.sync();
    // Elsewhere the colour changes; here (offline) the name changes and is not sent yet.
    await server.editElsewhere("account", "a1", { colour: "teal" }, `${Date.UTC(2026, 9, 31, 6, 30)}.0000.webbrw01`);
    await engine.record({ entity: "account", entityId: "a1", kind: "update", fields: { name: "Travel Card" } });
    jest.spyOn(server, "push").mockRejectedValueOnce(new Error("You appear to be offline."));
    await engine.sync(); // push fails → no pull

    // A pull with the change still waiting keeps the local edit visible.
    const pullOnly = new SyncEngine(store, { push: async () => [], pull: (c) => server.pull(c) }, "phone0001");
    jest.spyOn(store, "pending").mockResolvedValueOnce([]); // nothing to push in this run
    await pullOnly.sync();
    const row = await store.getRow("account", "a1");
    expect(row).toMatchObject({ name: "Travel Card", colour: "teal" });
  });

  it("advances its clock past versions seen in a pull (HLC observe)", async () => {
    const { server, engine } = setup();
    await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Cash") });
    await engine.sync();
    const future = Date.UTC(2026, 9, 31, 7, 0, 0);
    await server.editElsewhere("account", "a1", { colour: "red" }, `${future}.0005.webbrw01`);
    await engine.sync();
    const next = await engine.nextHlc();
    expect(Number(next.split(".")[0])).toBeGreaterThanOrEqual(future);
    expect(next.endsWith(".phone0001")).toBe(true);
  });

  it("surfaces renamed and rejected results so the user can be told (FR-032)", async () => {
    const a = setup("phone0001");
    const b = { ...setup("phone0002"), server: a.server };
    const engineB = new SyncEngine(b.store, a.server, "phone0002");
    await a.engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Fuel"), options: { onNameConflict: "suffix" } });
    await engineB.record({ entity: "account", entityId: "b1", kind: "create", fields: account("Fuel"), options: { onNameConflict: "suffix" } });
    await a.engine.sync();
    await engineB.sync();
    expect(await b.store.notices()).toEqual([expect.objectContaining({ status: "renamed", renamedTo: "Fuel (2)", entityId: "b1" })]);
    expect((await b.store.getRow("account", "b1"))?.name).toBe("Fuel (2)");

    await engineB.record({ entity: "account", entityId: "b2", kind: "create", fields: account("Wallet", "35000") });
    await engineB.record({ entity: "account", entityId: "b2", kind: "archive" });
    expect((await b.store.getRow("account", "b2"))?.state).toBe("archived"); // optimistic
    await engineB.sync();
    expect((await b.store.notices()).at(-1)).toMatchObject({ status: "rejected", code: "BALANCE_NOT_ZERO", entityId: "b2" });
    expect((await b.store.getRow("account", "b2"))?.state).toBe("active"); // the pull restores the server state
  });

  it("pages through a long pull and remembers the cursor", async () => {
    const { server, store, engine } = setup();
    server.pageSize = 2;
    for (let i = 0; i < 5; i++) await engine.record({ entity: "account", entityId: `a${i}`, kind: "create", fields: account(`Cash ${i}`) });
    const outcome = await engine.sync();
    expect(outcome.pulled).toBe(5);
    expect(await store.getState("cursor")).toBe("5");
    expect((await liveRows(store, "account")).length).toBe(5);
    expect((await engine.sync()).pulled).toBe(0); // nothing new since the cursor
  });

  it("shares one run between concurrent sync calls", async () => {
    const { server, engine } = setup();
    await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Cash") });
    await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
    expect(server.pushes).toBe(1);
  });

  it("wipes everything but unsent changes after 5 wrong PINs (FR-028, R-09)", async () => {
    const { store, engine } = setup();
    await engine.record({ entity: "account", entityId: "a1", kind: "create", fields: account("Cash") });
    await store.setState("cursor", "9");
    await store.wipeExceptPending();
    expect(await store.getRow("account", "a1")).toBeNull();
    expect(await store.getState("cursor")).toBeNull();
    expect(await store.pendingCount()).toBe(1);
  });
});

describe("applyLocally", () => {
  it("marks a merged source deleted and records its target", () => {
    const row = applyLocally({ id: "c1", state: "active", fieldVersions: {} }, {
      changeId: "x", entity: "category", entityId: "c1", kind: "merge", fields: { targetId: "c2" }, hlc: "1793011200000.0000.phone0001",
    } as ChangeInput);
    expect(row).toMatchObject({ state: "deleted", mergedInto: "c2" });
  });
});
