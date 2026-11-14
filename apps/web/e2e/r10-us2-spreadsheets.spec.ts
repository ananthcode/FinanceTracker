import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { exportFrom, filesIn } from "./helpers/exports";
import { isoMonth } from "./helpers/transactions";

/** R10 T016 — User Story 2: Excel and CSV (spec US2 1–3; quickstart S2-a, S2-b; SC-003). */

/** Minimal CSV reader for the test (quotes, commas, line breaks). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n") row.push(cell.replace(/\r$/, "")), rows.push(row), (row = []), (cell = "");
    else cell += ch;
  }
  return rows;
}

test("Excel: one workbook with a sheet per record type (S2-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "excel");
  await loadDemoFromSettings(page);
  const book = await exportFrom(page, "Excel workbook");
  expect(book.name).toMatch(/^Finance Tracker everything \d{4}-\d{2}-\d{2}\.xlsx$/);
  const parts = new Map((await filesIn(book.bytes)).map((e) => [e.name, new TextDecoder().decode(e.bytes)]));
  const workbook = parts.get("xl/workbook.xml")!;
  for (const sheet of ["Accounts", "People &amp; payees", "Categories", "Transactions", "Split lines", "Payment plan", "Templates", "Attachments"]) {
    expect(workbook).toContain(`name="${sheet}"`);
  }
  expect(parts.get("xl/worksheets/sheet5.xml")).toContain("Sunrise Apartments");
});

test("CSV for last month: only last month's transactions, and their total matches the transactions list (S2-b, SC-003)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "csv");
  await loadDemoFromSettings(page);
  const csv = await exportFrom(page, "CSV files (zip)", { range: "Last month" });
  const from = isoMonth(-1);
  const to = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).toISOString().slice(0, 10);
  expect(csv.name).toBe(`Finance Tracker ${from} to ${to}.zip`);
  const files = new Map((await filesIn(csv.bytes)).map((e) => [e.name, new TextDecoder().decode(e.bytes)]));
  expect([...files.keys()]).toContain("accounts.csv");
  const [header, ...rows] = parseCsv(files.get("transactions.csv")!.replace(/^﻿/, ""));
  const at = (name: string) => header!.indexOf(name);
  expect(rows.length).toBeGreaterThan(5);
  expect(rows.every((r) => r[at("Date")]! >= from && r[at("Date")]! <= to)).toBe(true);
  // The list's "net" counts confirmed, not-void entries, without transfers (R4).
  let net = 0n;
  for (const r of rows) {
    if (r[at("Type")] === "Transfer" || r[at("Confirmed")] === "No" || r[at("Status")] === "Void") continue;
    const [whole, paise] = r[at("Amount")]!.split(".");
    const minor = BigInt(whole!) * 100n + BigInt(paise!);
    net += r[at("In / out")] === "In" ? minor : -minor;
  }
  await page.goto(`/transactions?from=${from}&to=${to}`);
  const summary = page.getByText(/^\d+ transactions · net/);
  await expect(summary).toContainText(`${rows.length} transactions`);
  const shown = (await summary.innerText()).match(/net ₹([\d,]+)\.(\d{2}) (in|out)/)!;
  const listed = BigInt(shown[1]!.replace(/,/g, "")) * 100n + BigInt(shown[2]!);
  expect(shown[3] === "in" ? listed : -listed).toBe(net);
});
