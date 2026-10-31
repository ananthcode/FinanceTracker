import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists } from "./helpers/db";
import { isoDay, seedBusiness, seedTransactions, transactionRows } from "./helpers/transactions";

/** R4 T046 — User Story 6: find, filter and fix many transactions at once (spec US6 1–5; quickstart S6-a, S-del). */

const row = (page: Page, notes: string) => transactionRows(page).filter({ hasText: notes });

async function find(page: Page, query: string) {
  await page.goto(`/transactions?${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
}

test("search, filters, bulk tag, relocate, bulk delete; used payees cannot be deleted (US6 1–5, S6-a, S-del)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "txfind");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedBusiness(email, "FreshMart");
  const a = "Everyday Savings";
  await seedTransactions(email, [
    { date: isoDay(-10), kind: "expense", account: a, amountMinor: "100000", category: "Groceries", payee: "FreshMart", notes: "g1" },
    { date: isoDay(-9), kind: "expense", account: a, amountMinor: "200000", category: "Groceries", payee: "FreshMart", notes: "g2" },
    { date: isoDay(-8), kind: "expense", account: a, amountMinor: "50000", category: "Groceries", payee: "Fresh Mart", notes: "g3" },
    { date: isoDay(-7), kind: "expense", account: a, amountMinor: "30000", category: "Eating out", notes: "e1" },
    { date: isoDay(-6), kind: "expense", account: a, amountMinor: "150000", category: "Fuel", notes: "f1" },
    { date: isoDay(-50), kind: "expense", account: a, amountMinor: "70000", category: "Groceries", notes: "old" },
  ]);

  // US6 1: text matches payee names (and notes, references, categories), with the count.
  await page.goto("/transactions");
  const search = page.getByRole("search", { name: "Find transactions" });
  await expect(async () => {
    await search.getByLabel("Search").fill("FreshMart");
    await search.getByRole("button", { name: "Find" }).click();
    await expect(page).toHaveURL(/q=FreshMart/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("2 transactions")).toBeVisible();

  // US6 2: a category with its sub-categories, combined with a date range; count and net total.
  await page.goto("/transactions");
  await search.getByText("Filters", { exact: true }).click(); // a native <details>: works before the page is interactive
  await expect(async () => {
    await search.getByLabel("Category").selectOption({ label: "Food & groceries" });
    await search.getByLabel("From date").fill(isoDay(-20));
    await search.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/category=/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("4 transactions")).toContainText("net ₹3,800.00 out");
  await expect(row(page, "f1")).toHaveCount(0);
  await expect(row(page, "old")).toHaveCount(0);

  // US6 3: select two and add a tag in one step.
  await row(page, "g1").getByRole("checkbox").check();
  await row(page, "g2").getByRole("checkbox").check();
  const bar = page.getByRole("region", { name: "Change selected transactions" });
  await bar.getByLabel("Change").selectOption({ label: "Add tag" });
  await bar.getByLabel("To").selectOption({ label: "Diwali 2025" });
  await bar.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("2 changed.")).toBeVisible();
  await expect(row(page, "g1")).toContainText("#Diwali 2025");
  await expect(row(page, "g2")).toContainText("#Diwali 2025");
  await expect(row(page, "g3")).not.toContainText("#Diwali 2025");

  // US6 4 (S6-a): relocate FreshMart → Fresh Mart; FreshMart stays.
  await page.goto("/settings/payees");
  await page.getByRole("link", { name: "FreshMart", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit payee" })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.getByRole("button", { name: "Relocate transactions to another payee" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("dialog").getByLabel("Move them to").selectOption({ label: "Fresh Mart" });
  await page.getByRole("dialog").getByRole("button", { name: "Move transactions" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await find(page, "q=FreshMart");
  await expect(page.getByText("0 transactions")).toBeVisible();
  await find(page, `payee=${await payeeIdFromSettings(page, "Fresh Mart")}`);
  await expect(page.getByText("3 transactions")).toBeVisible();

  // US6 5: delete selected after confirming; they leave the list.
  await find(page, "q=old");
  await row(page, "old").getByRole("checkbox").check();
  await page.getByRole("region", { name: "Change selected transactions" }).getByRole("button", { name: "Delete selected" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("1 deleted.")).toBeVisible();
  await expect(row(page, "old")).toHaveCount(0);

  // S-del: a payee with transactions cannot be deleted; hide or merge is offered.
  await page.goto("/settings/payees");
  await page.getByRole("link", { name: "Fresh Mart", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit payee" })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Delete payee" }).click();
  await expect(page.getByRole("dialog")).toContainText("It has been used, so it can't be deleted. Hide or merge it instead.");
});

/** A payee's id from its Settings link. */
async function payeeIdFromSettings(page: Page, name: string): Promise<string> {
  await page.goto("/settings/payees");
  const href = await page.getByRole("link", { name, exact: true }).getAttribute("href");
  return href!.split("/").pop()!;
}
