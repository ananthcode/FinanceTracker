import { describe, expect, it } from "vitest";
import {
  backupChanges,
  backupFromPull,
  chunked,
  lockBackupText,
  MAX_CHANGES_PER_IMPORT_CHUNK,
  readBackup,
  unlockBackup,
  type BackupFile,
  type PullResponse,
} from "@ft/core";
import { balanceMovements, createBearerClient, listAccounts, listPayees, listTemplates, monthTotals } from "@ft/db";
import { POST as dataAction } from "@/app/api/me/data/route";
import { POST as exportLog } from "@/app/api/me/export-log/route";
import { GET as importStatus, POST as importAction } from "@/app/api/me/import/route";
import { GET as pull } from "@/app/api/sync/pull/route";
import { publicEnv } from "@/lib/env";
import { testAdmin } from "@/test/fixtures";
import { bearerRequest, newMember, type TestMember } from "@/test/sync";

/**
 * R10 T009 — export → reset → import gives back the same data (SC-001); a refused part undoes the whole import
 * (FR-012); a locked backup round trip; sessions are the caller's own. Synthetic demo data only.
 */
const API = "http://localhost:3000/api";
const client = (m: TestMember) => createBearerClient({ url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey }, m.token);
const post = (m: TestMember, url: string, body: unknown) => bearerRequest(`${API}${url}`, m.token, "POST", body);

/** Every record of the user, through the sync pull, as the browser export does. */
async function exportBackup(m: TestMember): Promise<BackupFile> {
  const rows: Record<string, Record<string, unknown>[]> = {};
  let cursor = "0";
  for (let page = 0; page < 200; page++) {
    const res = await pull(bearerRequest(`${API}/sync/pull?cursor=${cursor}`, m.token));
    const body = (await res.json()) as PullResponse;
    for (const [entity, list] of Object.entries(body.rows)) (rows[entity] ??= []).push(...(list as Record<string, unknown>[]));
    cursor = body.cursor;
    if (!body.hasMore) break;
  }
  return backupFromPull({ rows, baseCurrency: "INR", preferences: { numberFormat: "indian", categoriesStart: "suggested" }, exportedAt: new Date().toISOString() });
}

async function importBackup(m: TestMember, backup: BackupFile, reset = false): Promise<Response> {
  const plan = backupChanges(backup);
  expect(plan.problems).toEqual([]);
  const begin = await importAction(post(m, "/me/import", { action: "begin", ...(reset ? { reset: "RESET" } : {}) }));
  if (begin.status !== 200) return begin;
  const { importId } = (await begin.json()) as { importId: string };
  for (const part of chunked(plan.changes, MAX_CHANGES_PER_IMPORT_CHUNK)) {
    const res = await importAction(post(m, "/me/import", { action: "chunk", importId, changes: part }));
    if (res.status !== 200) {
      await importAction(post(m, "/me/import", { action: "abort", importId }));
      return res;
    }
  }
  return importAction(post(m, "/me/import", { action: "finish", importId, interest: plan.interest, categoriesStart: "suggested" }));
}

/** What the user sees, by name: balances, people, month totals, templates, plan size. */
async function snapshot(m: TestMember) {
  const db = client(m);
  const [accounts, people, totals, templates, months] = await Promise.all([
    listAccounts(db),
    listPayees(db, "person"),
    balanceMovements(db),
    listTemplates(db),
    monthTotals(db, { from: "2024-01-01", to: "2032-12-31" }),
  ]);
  const admin = testAdmin();
  const count = async (table: string) => (await admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", m.id).neq("state", "deleted")).count;
  return {
    accounts: Object.fromEntries(accounts.map((a) => [a.name, `${a.state} ${a.openingBalanceMinor + (totals.accounts[a.id] ?? 0n)}`])),
    people: Object.fromEntries(people.map((p) => [p.name, String(p.openingBalanceMinor + (totals.people[p.id] ?? 0n))])),
    months: months.map((r) => `${r.month} ${r.incomeMinor} ${r.spendingMinor}`),
    templates: templates.map((t) => `${t.sortKey} ${t.name} ${t.amountMinor} ${t.hidden}`).sort(),
    planItems: await count("plan_items"),
    planMonths: await count("plan_occurrences"),
    proposals: (await admin.from("transactions").select("interest_month").eq("user_id", m.id).eq("generated", true).order("interest_month")).data,
  };
}

describe("backup export and import", () => {
  it("export → reset → import gives back the same balances, people, month totals, plan and templates (SC-001)", async () => {
    const m = await newMember("expround");
    expect((await dataAction(post(m, "/me/data", { action: "load" }))).status).toBe(200);
    const before = await snapshot(m);
    const backup = await exportBackup(m);
    expect(backup.records.transaction.length).toBeGreaterThan(250);
    expect((await exportLog(post(m, "/me/export-log", { format: "backup", counts: { transaction: backup.records.transaction.length }, range: null, files: false, locked: false }))).status).toBe(204);

    // Not into existing data.
    const refused = await importAction(post(m, "/me/import", { action: "begin" }));
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("NOT_EMPTY");

    // Reset and import in one step.
    const finished = await importBackup(m, JSON.parse(JSON.stringify(backup)), true);
    expect(finished.status).toBe(200);
    expect(((await finished.json()) as { counts: Record<string, number> }).counts).toMatchObject({ transaction: backup.records.transaction.length });
    expect(await snapshot(m)).toEqual(before);

    const { data: events } = await testAdmin().from("audit_events").select("action, details").in("action", ["data_exported", "data_imported"]).eq("details->>ownerId", m.id);
    expect(events!.map((e) => e.action).sort()).toEqual(["data_exported", "data_imported"]);
    expect(JSON.stringify(events)).not.toContain("Everyday Savings"); // counts only, no contents
  }, 180_000);

  it("a refused part undoes the whole import (FR-012), and a session is the caller's own", async () => {
    const [m, other] = [await newMember("exprefuse"), await newMember("expother")];
    await dataAction(post(m, "/me/data", { action: "load" }));
    const backup = await exportBackup(m);
    await dataAction(post(m, "/me/data", { action: "reset", confirm: "RESET" }));

    const plan = backupChanges(backup);
    const begin = await importAction(post(m, "/me/import", { action: "begin" }));
    const { importId } = (await begin.json()) as { importId: string };
    expect(((await (await importStatus(bearerRequest(`${API}/me/import`, m.token))).json()) as { open: unknown }).open).toMatchObject({ importId });
    expect((await importAction(post(other, "/me/import", { action: "chunk", importId, changes: plan.changes.slice(0, 1) }))).status).toBe(409);

    expect((await importAction(post(m, "/me/import", { action: "chunk", importId, changes: plan.changes.slice(0, 100) }))).status).toBe(200);
    // A transaction on an account that does not exist: refused by the applier.
    const bad = structuredClone(plan.changes.find((c) => c.entity === "transaction")!);
    (bad.fields as { accountId: string }).accountId = crypto.randomUUID();
    bad.changeId = crypto.randomUUID();
    const res = await importAction(post(m, "/me/import", { action: "chunk", importId, changes: [bad] }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("IMPORT_REJECTED");
    expect((await importAction(post(m, "/me/import", { action: "abort", importId }))).status).toBe(200);
    expect((await listAccounts(client(m))).length).toBe(0);
  }, 180_000);

  it("a locked backup needs its password, and restores the same data", async () => {
    const m = await newMember("explock");
    await dataAction(post(m, "/me/data", { action: "load" }));
    const before = await snapshot(m);
    const { text } = await lockBackupText(JSON.stringify(await exportBackup(m)), "violet-kettle-27", 100_000);
    const read = readBackup(text);
    if (read.kind !== "locked") throw new Error("expected a locked backup");
    await expect(unlockBackup(read.locked, "wrong-password")).rejects.toThrow("WRONG_PASSWORD");
    const plain = readBackup((await unlockBackup(read.locked, "violet-kettle-27")).text);
    if (plain.kind !== "plain") throw new Error("expected a plain backup");
    expect((await importBackup(m, plain.backup, true)).status).toBe(200);
    expect(await snapshot(m)).toEqual(before);
  }, 180_000);
});
