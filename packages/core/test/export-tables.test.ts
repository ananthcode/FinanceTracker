import { describe, expect, it } from "vitest";
import { attachmentFilePath, backupFromPull, demoChanges, exportFileName, exportTables, transactionIdsInRange, type ExportTable } from "../src";

const TODAY = "2026-11-14";

function demoBackup() {
  const rows: Record<string, Record<string, unknown>[]> = {};
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of demoChanges(TODAY, { now: 1_790_000_000_000 })) {
    if (c.kind === "archive") {
      byId.get(c.entityId)!.state = "archived";
      continue;
    }
    const row: Record<string, unknown> = { id: c.entityId, ...c.fields, state: "active" };
    if (c.entity === "transaction") Object.assign(row, { flow: ["income", "refund"].includes(String(c.fields!.kind)) ? "in" : "out" });
    (rows[c.entity] ??= []).push(row);
    byId.set(c.entityId, row);
  }
  return backupFromPull({ rows, baseCurrency: "INR", preferences: {}, exportedAt: `${TODAY}T10:00:00Z` });
}

const table = (tables: ExportTable[], name: string) => tables.find((t) => t.name === name)!;
const col = (t: ExportTable, name: string) => t.columns.indexOf(name);

describe("spreadsheet tables (FR-003, FR-004)", () => {
  it("has one table per record type, with names instead of ids", () => {
    const backup = demoBackup();
    const tables = exportTables(backup);
    expect(tables.map((t) => t.name)).toEqual([
      "Accounts", "People & payees", "Categories", "Tags", "Transactions", "Split lines", "Interest rates", "Payment plan", "Plan months", "Templates", "Attachments",
    ]);
    const tx = table(tables, "Transactions");
    expect(tx.rows).toHaveLength(backup.records.transaction.length);
    expect(tx.rows.map((r) => r[0])).toEqual(tx.rows.map((_, i) => i + 1));
    const rent = tx.rows.find((r) => r[col(tx, "Notes")] === "Rent")!;
    expect(rent[col(tx, "Category")]).toBe("Home › Rent");
    expect(rent[col(tx, "Payee / person")]).toBe("Sunrise Apartments");
    expect(rent[col(tx, "Amount")]).toEqual({ money: 2_500_000n });
    const ids = new Set(Object.values(backup.records).flat().map((r) => r.id));
    for (const t of tables) for (const r of t.rows) for (const c of r) if (typeof c === "string") expect(ids.has(c)).toBe(false);
    // Split lines point at their transaction's number; the demo receipt is listed.
    const lines = table(tables, "Split lines");
    expect(lines.rows.length).toBeGreaterThan(0);
    for (const l of lines.rows) expect(tx.rows[(l[0] as number) - 1]![col(tx, "Category")]).toBe("Split");
    expect(table(tables, "Attachments").rows).toHaveLength(1);
    expect(table(tables, "Accounts").rows.some((r) => r[7] === true)).toBe(true); // an archived account
  });

  it("keeps only the range's transactions, split lines and attachments; lists stay complete", () => {
    const backup = demoBackup();
    const range = { from: "2026-10-01", to: "2026-10-31" };
    const tables = exportTables(backup, { range });
    const tx = table(tables, "Transactions");
    const dates = tx.rows.map((r) => (r[1] as { date: string }).date);
    expect(dates.every((d) => d >= range.from && d <= range.to)).toBe(true);
    expect(tx.rows).toHaveLength(transactionIdsInRange(backup, range).size);
    const inRange = backup.records.transaction.filter((t) => String(t.date) >= range.from && String(t.date) <= range.to);
    const total = (list: bigint[]) => list.reduce((s, x) => s + x, 0n);
    expect(total(tx.rows.map((r) => (r[col(tx, "Amount")] as { money: bigint }).money))).toBe(total(inRange.map((t) => BigInt(String(t.amountMinor)))));
    expect(table(tables, "Accounts").rows).toHaveLength(backup.records.account.length);
    expect(table(tables, "Attachments").rows).toHaveLength(0); // the receipt's purchase is not in October
  });

  it("names files and attachment paths plainly", () => {
    expect(exportFileName("backup", TODAY)).toBe("Finance Tracker backup 2026-11-14.json");
    expect(exportFileName("backup", TODAY, { zipped: true })).toBe("Finance Tracker backup 2026-11-14.zip");
    expect(exportFileName("xlsx", TODAY, { range: { from: "2026-04-01", to: "2026-11-14" } })).toBe("Finance Tracker 2026-04-01 to 2026-11-14.xlsx");
    expect(exportFileName("csv", TODAY)).toBe("Finance Tracker everything 2026-11-14.zip");
    expect(attachmentFilePath(7, "2026-11-14", 'Bill: "Fridge"/1.pdf')).toBe("attachments/007 2026-11-14 Bill Fridge 1.pdf");
  });
});
