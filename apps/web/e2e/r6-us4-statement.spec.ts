import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists } from "./helpers/db";
import { addTransaction, isoDay, isoMonth, seedDemoTransactions } from "./helpers/transactions";

/** R6 T018 — User Story 4: a person statement to share (spec US4 1–5; quickstart S4-a; SC-005). */

/** "+₹1,234.50" → 123450; "−₹300.00" → −30000. */
const signedPaise = (text: string) => (text.includes("−") ? -1n : 1n) * BigInt(text.replace(/[^\d]/g, "") || "0");
const paise = (text: string) => BigInt(text.replace(/[^\d]/g, "") || "0");

async function openPerson(page: Page, name: string) {
  await page.goto("/people");
  const href = await page.locator(`[data-person-name='${name}']`).getByRole("link").getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function openStatement(page: Page, from: string, to: string) {
  await page.getByLabel("From", { exact: true }).fill(from);
  await page.getByLabel("To", { exact: true }).fill(to);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}`));
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(from);
}

async function figures(page: Page) {
  const rows = page.locator("[data-statement-row]");
  return {
    opening: signedPaise(await page.locator("#statement-opening").innerText()),
    amounts: (await rows.locator("[data-statement-amount]").allInnerTexts()).map(signedPaise),
    balances: (await rows.locator("[data-statement-balance]").allInnerTexts()).map(signedPaise),
    closingWords: await page.locator("#statement-closing").innerText(),
  };
}

async function fetchFile(page: Page, button: string): Promise<{ download: Download; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
  return { download, bytes: await readFile(await download.path()) };
}

test("opening, rows with a running balance and closing in words; sign setting; PNG and PDF (US4 1–3, S4-a, SC-005)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "statement");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);

  // A movement with a note, so "Include notes" has something to change.
  const note = "Family trip advance";
  await addTransaction(page, {
    type: "Person",
    action: "Lent to",
    payee: ["Ravi", "Ravi Kumar"],
    account: "Everyday Savings",
    amount: "1,234.00",
    date: isoDay(0),
    notes: note,
  });

  await openPerson(page, "Ravi Kumar");
  const balanceWords = await page.locator("[data-person-balance]").first().innerText();
  await page.getByRole("link", { name: "Statement", exact: true }).click();
  // The first visit compiles the page on a development server.
  await expect(page.getByRole("heading", { level: 1, name: "Statement for Ravi Kumar" })).toBeVisible({ timeout: 15_000 });

  const from = isoMonth(-6);
  const to = isoDay(0);
  await openStatement(page, from, to);

  // US4 1: the running balance follows from the opening balance, row by row, and ends at the closing.
  const shown = await figures(page);
  expect(shown.amounts.length).toBeGreaterThan(0);
  let running = shown.opening;
  shown.amounts.forEach((amount, i) => {
    running += amount;
    expect(shown.balances[i], `row ${i}`).toBe(running);
  });
  await expect(page.locator("#statement-closing")).toHaveAttribute("data-closing-figure", running.toString());
  // FR-012: the closing balance is the person's balance (the range ends today).
  expect(paise(shown.closingWords)).toBe(running < 0n ? -running : running);
  expect(paise(balanceWords)).toBe(paise(shown.closingWords));
  expect(shown.closingWords).toContain(running > 0n ? "Ravi Kumar owes you" : "You owe Ravi Kumar");
  // On screen the notes always show.
  await expect(page.getByText(note)).toBeVisible();

  // US4 3: real files, named after the person and the range.
  const png = await fetchFile(page, "Download image (PNG)");
  expect(png.download.suggestedFilename()).toBe(`Statement - Ravi Kumar - ${from} to ${to}.png`);
  expect(png.bytes.subarray(0, 8).toString("latin1")).toBe("\x89PNG\r\n\x1a\n");
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toBeVisible();

  const pdf = await fetchFile(page, "Download PDF");
  expect(pdf.download.suggestedFilename()).toBe(`Statement - Ravi Kumar - ${from} to ${to}.pdf`);
  const pdfText = pdf.bytes.toString("latin1");
  expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
  expect(pdfText).toMatch(/\/Count [1-9]/);
  expect(pdfText).toContain("/Filter /DCTDecode");
  expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);

  // Notes reach the file only when switched on.
  const withoutNotes = await fetchFile(page, "Download image (PNG)");
  expect(withoutNotes.bytes.equals(png.bytes)).toBe(true);
  await page.getByLabel("Include notes").check();
  const withNotes = await fetchFile(page, "Download image (PNG)");
  expect(withNotes.bytes.equals(png.bytes)).toBe(false);
  await test.info().attach("statement-with-notes.png", { body: withNotes.bytes, contentType: "image/png" });
  // US4 2: the sign setting flips every figure, keeps the words, and stays.
  await page.getByLabel("I owe them is positive").check();
  await expect(page.locator("#statement-closing")).toHaveAttribute("data-closing-figure", (-running).toString());
  const flipped = await figures(page);
  expect(flipped.opening).toBe(-shown.opening);
  expect(flipped.amounts).toEqual(shown.amounts.map((a) => -a));
  expect(flipped.balances).toEqual(shown.balances.map((b) => -b));
  expect(flipped.closingWords).toBe(shown.closingWords);
  await page.reload();
  await expect(page.getByLabel("I owe them is positive")).toBeChecked();
});

test("a range with no movements says so; hide-balances masks the screen, not the file (US4 4, 5)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "statementempty");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);

  await openPerson(page, "Ravi Kumar");
  await page.getByRole("link", { name: "Statement", exact: true }).click();
  // The first visit compiles the page on a development server.
  await expect(page.getByRole("heading", { level: 1, name: "Statement for Ravi Kumar" })).toBeVisible({ timeout: 15_000 });

  // US4 4 (the demo opening date is 2025-04-01: nothing happened before it).
  await openStatement(page, "2020-01-01", "2020-12-31");
  await expect(page.getByText("No movements in this period.")).toBeVisible();
  await expect(page.locator("[data-statement-row]")).toHaveCount(0);
  const empty = await figures(page);
  expect(paise(empty.closingWords)).toBe(empty.opening < 0n ? -empty.opening : empty.opening);

  // US4 5.
  await openStatement(page, isoMonth(-6), isoDay(0));
  await page.getByRole("switch", { name: "Hide balances" }).click();
  await expect(page.locator("#statement-opening")).toContainText("₹••••");
  expect(await page.locator("main").innerText()).not.toMatch(/₹\s?[\d,]+\.\d{2}/);
  const file = await fetchFile(page, "Download PDF");
  expect(file.bytes.toString("latin1").startsWith("%PDF-1.4")).toBe(true);
  await page.getByRole("switch", { name: "Hide balances" }).click();
});
