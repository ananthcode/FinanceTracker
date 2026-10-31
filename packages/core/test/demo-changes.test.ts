import { describe, expect, it } from "vitest";
import { Change, DEMO_HLC_DEVICE, demoAccounts, demoChanges, demoLists, demoTransactions, parseHlc, type ChangeInput } from "../src";

/** R5 T003 — the demo household as sync changes (research R5-01). */
const TODAY = "2026-11-01";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every id a change's fields point at (the references to remap). */
function references(c: ChangeInput): string[] {
  const f = (c.fields ?? {}) as Record<string, unknown>;
  const refs = ["groupId", "parentId", "defaultCategoryId", "accountId", "toAccountId", "payeeId", "categoryId"]
    .map((k) => f[k])
    .filter((v): v is string => typeof v === "string");
  for (const id of (f.tagIds as string[] | undefined) ?? []) refs.push(id);
  for (const l of (f.lines as Record<string, unknown>[] | undefined) ?? []) {
    for (const k of ["categoryId", "personId"]) if (typeof l[k] === "string") refs.push(l[k] as string);
    for (const id of (l.tagIds as string[] | undefined) ?? []) refs.push(id);
  }
  return refs;
}

describe("demoChanges", () => {
  const changes = demoChanges(TODAY, { now: Date.UTC(2026, 10, 1) });

  it("is valid on the wire: every change passes the sync schema", () => {
    for (const c of changes) {
      const parsed = Change.safeParse(c);
      expect(parsed.success, `${c.entity} ${c.kind}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true);
    }
  });

  it("uses fresh, unique ids and an increasing clock on a non-device id", () => {
    const created = changes.filter((c) => c.kind === "create").map((c) => c.entityId);
    expect(new Set(created).size).toBe(created.length);
    expect(created.every((id) => UUID.test(id) && !id.startsWith("00000000-0000-4000-8000-"))).toBe(true);
    const clocks = changes.map((c) => parseHlc(c.hlc));
    expect(clocks.every((h) => h.device === DEMO_HLC_DEVICE)).toBe(true);
    for (let i = 1; i < clocks.length; i++) {
      const [a, b] = [clocks[i - 1]!, clocks[i]!];
      expect(b.wall > a.wall || (b.wall === a.wall && b.counter > a.counter)).toBe(true);
    }
  });

  it("points every reference at something created earlier in the list", () => {
    const seen = new Set<string>();
    for (const c of changes) {
      for (const ref of references(c)) expect(seen.has(ref), `${c.entity} → ${ref}`).toBe(true);
      if (c.kind === "create") seen.add(c.entityId);
      // A split line's own id is new, not a reference.
    }
  });

  it("archives the archived demo account after creating it", () => {
    const archive = changes.filter((c) => c.kind === "archive");
    expect(archive).toHaveLength(demoAccounts().accounts.filter((a) => a.state === "archived").length);
    for (const a of archive) {
      expect(changes.findIndex((c) => c.kind === "create" && c.entityId === a.entityId)).toBeLessThan(changes.indexOf(a));
    }
  });

  it("holds exactly the generators' records", () => {
    const count = (entity: ChangeInput["entity"]) => changes.filter((c) => c.entity === entity && c.kind === "create").length;
    const { groups, accounts } = demoAccounts();
    const { categories, tags, payees } = demoLists();
    const { transactions, rates } = demoTransactions(TODAY);
    expect([count("account_group"), count("account"), count("category"), count("tag"), count("payee"), count("person_rate"), count("transaction")]).toEqual([
      groups.length, accounts.length, categories.length, tags.length, payees.length, rates.length, transactions.length,
    ]);
  });

  it("gives every user the same records with their own ids", () => {
    const strip = (list: ChangeInput[]) => list.map((c) => ({ entity: c.entity, kind: c.kind, amount: (c.fields as { amountMinor?: string } | undefined)?.amountMinor, date: (c.fields as { date?: string } | undefined)?.date }));
    const other = demoChanges(TODAY, { now: Date.UTC(2026, 10, 1) });
    expect(strip(other)).toEqual(strip(changes));
    expect(other[0]!.entityId).not.toBe(changes[0]!.entityId);
  });
});
