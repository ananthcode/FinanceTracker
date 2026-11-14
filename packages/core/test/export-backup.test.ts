import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  backupChanges,
  backupCounts,
  backupFromPull,
  demoChanges,
  lockBackupText,
  readBackup,
  unlockBackup,
  type BackupFile,
  type ChangeInput,
} from "../src";

const TODAY = "2026-11-14";

/** Pull-like rows from the demo changes (what the server would return after a demo load). */
function demoRows(): Record<string, Record<string, unknown>[]> {
  const rows: Record<string, Record<string, unknown>[]> = {};
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of demoChanges(TODAY, { now: 1_790_000_000_000 })) {
    if (c.kind === "archive") {
      byId.get(c.entityId)!.state = "archived";
      continue;
    }
    if (c.entity === "attachment") continue;
    const row: Record<string, unknown> = { id: c.entityId, ...c.fields, state: "active", serverSeq: "1", fieldVersions: {} };
    if (c.entity === "transaction") Object.assign(row, { flow: "out", generated: false, interestMonth: null, userEdited: false });
    (rows[c.entity] ??= []).push(row);
    byId.set(c.entityId, row);
  }
  return rows;
}

const source = (rows = demoRows()) => ({ rows, baseCurrency: "INR", preferences: { numberFormat: "indian", categoriesStart: "suggested" }, exportedAt: "2026-11-14T10:00:00Z" });

describe("the backup (R10-02)", () => {
  it("keeps live records without sync bookkeeping, and remembers declined interest proposals", () => {
    const rows = demoRows();
    const person = rows.payee!.find((p) => p.kind === "person")!;
    rows.transaction!.push(
      { id: crypto.randomUUID(), kind: "interest", date: "2026-10-31", payeeId: person.id, amountMinor: "100", generated: true, interestMonth: "2026-10-01", state: "deleted" },
      { id: crypto.randomUUID(), kind: "expense", date: "2026-10-31", state: "deleted" },
    );
    const backup = backupFromPull(source(rows));
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.records.transaction.length).toBe(rows.transaction!.length - 2);
    expect(backup.records.account[0]).not.toHaveProperty("serverSeq");
    expect(backup.records.account[0]).not.toHaveProperty("fieldVersions");
    expect(backup.declinedInterest).toEqual([{ payeeId: person.id, month: "2026-10-01" }]);
    expect(backupCounts(backup).account).toBe(8);
  });

  it("reads plain backups and says what is wrong with other files", () => {
    const backup = backupFromPull(source());
    expect(readBackup(JSON.stringify(backup)).kind).toBe("plain");
    expect(readBackup("not json")).toMatchObject({ kind: "problem", problem: expect.stringContaining("not a backup") });
    expect(readBackup('{"format":"other"}')).toMatchObject({ kind: "problem", problem: "This file is not a backup of this app." });
    expect(readBackup(JSON.stringify({ ...backup, version: 2 }))).toMatchObject({ kind: "problem", problem: expect.stringContaining("newer version") });
    expect(readBackup(JSON.stringify({ ...backup, records: { ...backup.records, account: [{ name: "No id" }] } })).kind).toBe("problem");
  });

  it("locks with a password; the right one unlocks, a wrong one is refused", async () => {
    const text = JSON.stringify(backupFromPull(source()));
    const { text: lockedText } = await lockBackupText(text, "kettle-orbit-27", 100_000);
    expect(lockedText).not.toContain("Everyday Savings");
    const read = readBackup(lockedText);
    expect(read.kind).toBe("locked");
    if (read.kind !== "locked") return;
    expect((await unlockBackup(read.locked, "kettle-orbit-27")).text).toBe(text);
    await expect(unlockBackup(read.locked, "kettle-orbit-28")).rejects.toThrow("WRONG_PASSWORD");
    await expect(lockBackupText(text, "short")).rejects.toThrow("PASSWORD_TOO_SHORT");
  });
});

describe("restoring a backup as changes (R10-05)", () => {
  it("gives every record a new id, remaps references, and passes the push shapes", () => {
    const backup = backupFromPull(source());
    const plan = backupChanges(backup, { now: 1_790_000_000_000 });
    expect(plan.problems).toEqual([]);
    const oldIds = new Set(Object.values(backup.records).flat().map((r) => r.id));
    for (const c of plan.changes) {
      if (c.entity !== "plan_occurrence") expect(oldIds.has(c.entityId)).toBe(false);
      for (const v of Object.values(c.fields ?? {})) if (typeof v === "string" && oldIds.has(v)) throw new Error(`old id kept in ${c.entity}`);
    }
    // Restore order: lists before what uses them; archiving last.
    const order = plan.changes.map((c) => c.entity);
    expect(order.indexOf("account")).toBeLessThan(order.indexOf("transaction"));
    expect(order.indexOf("plan_item")).toBeLessThan(order.indexOf("template"));
    expect(plan.changes.at(-1)).toMatchObject({ entity: "account", kind: "archive" });
  });

  it("restores the same records the demo load created (same fields, apart from ids)", () => {
    const original = demoChanges(TODAY, { now: 1_790_000_000_000 }).filter((c) => c.kind === "create" && c.entity !== "attachment");
    const plan = backupChanges(backupFromPull(source()), { now: 1_790_000_000_000 });
    const creates = plan.changes.filter((c) => c.kind === "create");
    const count = (list: ChangeInput[]) => list.reduce<Record<string, number>>((m, c) => ({ ...m, [c.entity]: (m[c.entity] ?? 0) + 1 }), {});
    expect(count(creates)).toEqual(count(original));
    const names = (list: ChangeInput[], entity: string) => list.filter((c) => c.entity === entity).map((c) => (c.fields as { name?: string }).name).sort();
    for (const e of ["account", "category", "payee", "tag", "plan_item", "template"]) expect(names(creates, e)).toEqual(names(original, e));
    const amounts = (list: ChangeInput[]) => list.filter((c) => c.entity === "transaction").map((c) => `${(c.fields as { date: string }).date} ${(c.fields as { amountMinor: string }).amountMinor}`).sort();
    expect(amounts(creates)).toEqual(amounts(original));
  });

  it("finds broken references and broken rules, in words", () => {
    const backup = backupFromPull(source());
    const broken: BackupFile = structuredClone(backup);
    broken.records.transaction[0]!.accountId = crypto.randomUUID();
    const split = broken.records.transaction.find((t) => Array.isArray(t.lines) && t.lines.length > 0)!;
    split.amountMinor = "1";
    const { problems } = backupChanges(broken);
    expect(problems.some((p) => p.includes("refers to account that is not in the backup"))).toBe(true);
    expect(problems.some((p) => p.includes("The split lines must add up to the amount"))).toBe(true);
  });

  it("keeps interest proposals as proposals and drops links to planned payments that are gone", () => {
    const rows = demoRows();
    const person = rows.payee!.find((p) => p.kind === "person")!;
    const proposal = { id: crypto.randomUUID(), kind: "interest", flow: "out", date: "2026-10-31", payeeId: person.id, amountMinor: "675", status: "uncleared", confirmed: false, generated: true, interestMonth: "2026-10-01", userEdited: false, state: "active", lines: [], tagIds: [] };
    rows.transaction!.push(proposal);
    const linked = rows.transaction!.find((t) => t.planItemId)!;
    rows.plan_item = rows.plan_item!.filter((i) => i.id !== linked.planItemId);
    const plan = backupChanges(backupFromPull(source(rows)));
    expect(plan.problems).toEqual([]);
    expect(plan.interest.proposals).toHaveLength(1);
    expect(plan.interest.proposals[0]).toMatchObject({ interestMonth: "2026-10-01", userEdited: false });
    const restored = plan.changes.find((c) => c.entityId === plan.interest.proposals[0]!.transactionId)!;
    expect(restored.fields).toMatchObject({ kind: "interest", flow: "out", confirmed: false });
  });
});
