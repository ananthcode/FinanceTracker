import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { seedLists } from "./helpers/db";
import { addPerson, pickCategory } from "./helpers/lists";
import { accountRow, isoDay, pickPayee, transactionRows } from "./helpers/transactions";

/** R4 T042 — User Story 5: split a transaction (spec US5 1–2, US3 scenario 5; quickstart S5-a, S3-b). */

async function openNewExpense(page: Page, amount: string, payee?: [string, string]) {
  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add transaction" })).toBeVisible();
  if (payee) await pickPayee(page, "Payee (optional)", ...payee);
  await expect(async () => {
    await page.getByLabel("Amount", { exact: true }).fill(amount);
    await page.getByRole("button", { name: "Split into lines" }).click();
    await expect(page.getByRole("group", { name: "Split into lines" })).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.getByLabel("Date", { exact: true }).fill(isoDay(-3));
}

const allocation = (page: Page) => page.getByRole("group", { name: "Split into lines" }).getByRole("status").first();

test("a bill split into three categories saves only when the lines add up (US5 1–2, S5-a)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "txsplit");
  await seedLists(email, { demo: true });
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "1,00,000.00", date: isoDay(-60) });

  await openNewExpense(page, "4,500.00", ["Fresh", "Fresh Mart"]);
  // The first line takes the amount and the payee's default category.
  await expect(page.getByRole("combobox", { name: "Line 1 category" })).toHaveValue("Food & groceries › Groceries");
  await expect(allocation(page)).toHaveText("Fully allocated.");

  await page.getByLabel("Line 1 amount").fill("3,200.00");
  await page.getByLabel("Line 2 amount").fill("1,050.00");
  await pickCategory(page, "Line 2 category", "Household", "Shopping › Household items");
  await page.getByLabel("Line 2 notes (optional)").fill("Detergent");
  await expect(allocation(page)).toHaveText("₹250.00 left to allocate");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("The lines must add up to the amount before you save.")).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\/new$/);

  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByLabel("Line 3 amount")).toHaveValue("250.00");
  await pickCategory(page, "Line 3 category", "Personal", "Shopping › Personal care");
  await expect(allocation(page)).toHaveText("Fully allocated.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  const row = transactionRows(page).first();
  await expect(row).toContainText("Spent at Fresh Mart");
  await expect(row).toContainText("Split (3)");

  // Each line keeps its own category and notes.
  await row.getByRole("link", { name: "Spent at Fresh Mart" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit transaction" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("combobox", { name: "Line 2 category" })).toHaveValue("Shopping › Household items");
  await expect(page.getByLabel("Line 2 notes (optional)")).toHaveValue("Detergent");
  await expect(page.getByRole("combobox", { name: "Line 3 category" })).toHaveValue("Shopping › Personal care");

  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹95,500.00");
});

test("part of a bill paid on a friend's behalf is not spending; the friend owes it (US3 5, S3-b)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "txsplitfriend");
  await seedLists(email, { demo: true });
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "1,00,000.00", date: isoDay(-60) });
  await addPerson(page, { name: "Kiran Shah", date: isoDay(-60) });

  await openNewExpense(page, "3,000.00");
  await page.getByLabel("Line 1 amount").fill("1,000.00");
  await pickCategory(page, "Line 1 category", "Eating", "Food & groceries › Eating out");
  await page.getByLabel("Line 2 amount").fill("2,000.00");
  await page.getByRole("group", { name: "Line 2 is" }).getByLabel("Paid on behalf of a person").check();
  await pickPayee(page, "Line 2: paid on behalf of", "Kiran", "Kiran Shah");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  await page.goto("/people");
  await expect(page.locator("[data-person-name='Kiran Shah']")).toContainText("owes you ₹2,000.00");
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹97,000.00");
});
