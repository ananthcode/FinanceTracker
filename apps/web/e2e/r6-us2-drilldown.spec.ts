import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists } from "./helpers/db";
import { seedDemoTransactions } from "./helpers/transactions";

/** R6 T012 — User Story 2: drill into spending and income (spec US2 1–7; quickstart S2-a; SC-002, SC-004). */

/** "₹1,234.50" → 123450 paise; "₹300.00 refunded" → −30000. */
const paise = (text: string) => (text.includes("refunded") ? -1n : 1n) * BigInt(text.replace(/[^\d]/g, "") || "0");

/** The level's total and the amounts of its entries, read from the "Show as table" view. */
async function level(page: Page) {
  const total = paise(await page.locator("#report-level-total").innerText());
  const cells = await page.locator("details table tbody tr td:first-of-type").allTextContents();
  return { total, entries: cells.map(paise) };
}
/** One entry's amount, from the table view's row named exactly `name`. */
async function amountOf(page: Page, name: string) {
  const row = page.locator("details table tbody tr", { has: page.locator("th", { hasText: new RegExp(`^${name}$`) }) });
  return paise((await row.locator("td").first().textContent()) ?? "");
}
const sum = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);

test("spending drills category → sub-category → payee → transactions, adding up at every level (US2 1–5, S2-a, SC-004)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "drill");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);

  // Reports opens on spending by category; selection 1: the period.
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Report" }).locator('[aria-current="page"]')).toHaveText("Spending");
  await page.getByLabel("Period").selectOption("last_month");
  await expect(page).toHaveURL(/period=last_month/);
  await expect(page.getByRole("heading", { level: 2, name: /Spending by category/ })).toBeVisible();
  const top = await level(page);
  expect(sum(top.entries)).toBe(top.total);

  // Selection 2: the category — its sub-categories (and anything on it directly) add up to it.
  const food = page.getByRole("list", { name: "Spending by category" }).getByRole("link", { name: /Food & groceries/ });
  const foodAmount = await amountOf(page, "Food & groceries");
  await food.click();
  await expect(page.getByRole("heading", { level: 2, name: /Food & groceries by sub-category/ })).toBeVisible();
  const sub = await level(page);
  expect(sub.total).toBe(foodAmount);
  expect(sum(sub.entries)).toBe(sub.total);

  // Selection 3: the sub-category — its payees add up to it.
  await page.getByRole("list", { name: "Food & groceries by sub-category" }).getByRole("link", { name: /^Groceries/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Groceries by payee/ })).toBeVisible();
  const byPayee = await level(page);
  expect(sum(byPayee.entries)).toBe(byPayee.total);

  // Selection 4: the payee — the transactions, whose total is the payee's amount; each opens the transaction.
  const freshMart = page.getByRole("list", { name: "Groceries by payee" }).getByRole("link", { name: /Fresh Mart/ });
  const freshAmount = await amountOf(page, "Fresh Mart");
  await freshMart.click();
  await expect(page.getByRole("heading", { level: 2, name: "Fresh Mart in Groceries" })).toBeVisible();
  const rows = page.getByRole("list", { name: "Transactions" }).getByRole("listitem");
  expect(await rows.count()).toBeGreaterThan(0);
  expect(paise(await page.locator("#report-transactions-total").innerText())).toBe(freshAmount);

  // US2 5: the breadcrumb goes back to any level with the same period.
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await crumbs.getByRole("link", { name: "Food & groceries" }).click();
  await expect(page).toHaveURL(/period=last_month/);
  await expect(page.getByRole("heading", { level: 2, name: /Food & groceries by sub-category/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "All spending" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Spending by category/ })).toBeVisible();
  await expect(page).toHaveURL(/period=last_month/);

  // US2 4: a transaction opens.
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 2, name: "Fresh Mart in Groceries" })).toBeVisible();
  await page.getByRole("list", { name: "Transactions" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);
});

test("income drills the same way; the table view shows the same numbers (US2 6, 7)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "drillinc");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);

  await page.goto("/reports?view=income&period=last_month");
  await expect(page.getByRole("heading", { level: 2, name: /Income by category/ })).toBeVisible();
  const top = await level(page);
  expect(top.entries.length).toBeGreaterThan(0);
  expect(sum(top.entries)).toBe(top.total);

  // US2 7: every bar is a link named with its amount; "Show as table" opens the same numbers.
  const bars = page.getByRole("list", { name: "Income by category" }).getByRole("link");
  await expect(bars).toHaveCount(top.entries.length);
  await page.getByText("Show as table").click();
  await expect(page.locator("details table")).toBeVisible();
  await expect(page.locator("details table tbody tr")).toHaveCount(top.entries.length);

  await bars.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "All income" })).toBeVisible();
  const next = await level(page);
  expect(next.total).toBe(top.entries[0]);
  expect(sum(next.entries)).toBe(next.total);
});
