import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists } from "./helpers/db";
import {
  accountRow,
  addTransaction,
  backdateTransaction,
  fillTransaction,
  isoDay,
  pickPayee,
  setPayeeHidden,
  transactionRows,
} from "./helpers/transactions";

/**
 * R4 T023 — User Story 1: record spending and income (spec US1 1–9; quickstart S1-a … S1-e; SC-001).
 * Dates are relative to today so the scenarios hold on any day.
 */

const opening = isoDay(-60);

async function memberWithSavings(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, prefix: string) {
  const email = await newSignedInMember(page, request, prefix);
  await seedLists(email, { demo: true });
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "1,00,000.00", date: opening });
  return email;
}

test("an expense and an income move the balance and list newest first (US1 1–3, S1-a, SC-001)", async ({ page, request }) => {
  await memberWithSavings(page, request, "txrecord");

  const started = Date.now();
  await page.goto("/transactions/new");
  await pickPayee(page, "Payee (optional)", "Fresh", "Fresh Mart");
  // The payee's default category fills in (US1 3).
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue("Food & groceries › Groceries");
  await fillTransaction(page, { amount: "1,234.50", date: isoDay(-26) });
  await expect(page).toHaveURL(/\/transactions$/);
  expect(Date.now() - started).toBeLessThan(20_000); // SC-001

  await addTransaction(page, { type: "Income", amount: "85,000.00", date: isoDay(-30), payee: ["Acme", "Acme Payroll"] });

  const rows = transactionRows(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Spent at Fresh Mart");
  await expect(rows.nth(0)).toContainText("Food & groceries › Groceries");
  await expect(rows.nth(0)).toContainText("₹1,234.50");
  await expect(rows.nth(1)).toContainText("Received from Acme Payroll");
  await expect(rows.nth(1)).toContainText("Salary › Salary");
  await expect(page.getByText("2 transactions")).toBeVisible();

  // 1,00,000.00 − 1,234.50 + 85,000.00
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹1,83,765.50");
});

test("no category is Uncategorised; a refund adds back; a new payee is added in the same step (US1 2a, 4, 5, S1-b, S1-c)", async ({ page, request }) => {
  await memberWithSavings(page, request, "txuncat");
  await addTransaction(page, { amount: "500", date: isoDay(-5), notes: "Parking" });
  await expect(transactionRows(page).first()).toContainText("Uncategorised");

  await addTransaction(page, { type: "Refund", amount: "500.00", date: isoDay(-4), payee: ["Fresh", "Fresh Mart"], category: ["Groc", "Food & groceries › Groceries"] });
  await expect(transactionRows(page).first()).toContainText("Refund from Fresh Mart");

  await page.goto("/transactions/new");
  await pickPayee(page, "Payee (optional)", "Corner Bakery", "Add “Corner Bakery” as a new business");
  await fillTransaction(page, { amount: "120", date: isoDay(-3) });
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(transactionRows(page).first()).toContainText("Spent at Corner Bakery");
  await page.goto("/settings/payees");
  await expect(page.getByRole("link", { name: "Corner Bakery" })).toBeVisible();

  // The expense and the refund cancel out; the bakery is spent.
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹99,880.00");
});

test("a date before the account's opening balance is refused with a link (S1-d)", async ({ page, request }) => {
  await memberWithSavings(page, request, "txopening");
  await page.goto("/transactions/new");
  await fillTransaction(page, { amount: "100", date: isoDay(-90) });
  // (Next's route announcer is an alert too.)
  const alert = page.getByRole("alert").filter({ hasText: "This date is before Everyday Savings’ opening balance" });
  await expect(alert).toBeVisible();
  await alert.getByRole("link", { name: "Change Everyday Savings’ opening date" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit account" })).toBeVisible();
});

test("amounts that are not valid are refused with an explanation (US1 6)", async ({ page, request }) => {
  await memberWithSavings(page, request, "txamount");
  await page.goto("/transactions/new");
  for (const [amount, message] of [
    ["12.345", "Use at most two decimal places."],
    ["0", "Enter an amount greater than zero."],
    ["99,99,99,99,99,999", "The amount is too large."],
  ]) {
    await page.getByLabel("Amount", { exact: true }).fill(amount!);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(message!)).toBeVisible();
  }
  await expect(page).toHaveURL(/\/transactions\/new$/);
});

test("archived accounts and hidden payees are not offered for new transactions (US1 7)", async ({ page, request }) => {
  const email = await newSignedInMember(page, request, "txoffer");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await setPayeeHidden(email, "Fresh Mart");
  await page.goto("/transactions/new");
  const accounts = page.getByLabel("Paid from").locator("option");
  await expect(accounts.filter({ hasText: "Everyday Savings" })).toHaveCount(1);
  await expect(accounts.filter({ hasText: "Old Wallet" })).toHaveCount(0);
  const payee = page.getByRole("combobox", { name: "Payee (optional)" });
  await payee.click();
  await payee.fill("Fresh");
  await expect(page.getByRole("option", { name: "Fresh Mart", exact: true })).toHaveCount(0);
});

test("an upcoming transaction counts only once confirmed after its date (US1 8–9, S1-e)", async ({ page, request }) => {
  const email = await memberWithSavings(page, request, "txupcoming");
  await page.goto("/transactions/new");
  // Until the page is interactive a typed date is not seen: type it again until the note shows.
  await expect(async () => {
    await page.getByLabel("Date", { exact: true }).fill(isoDay(4));
    await expect(page.getByText("Upcoming: it won’t change any balance yet.")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await fillTransaction(page, { amount: "25,000.00", notes: "Rent" });
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(transactionRows(page).first()).toContainText("Upcoming");
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹1,00,000.00");

  // The date arrives.
  await backdateTransaction(email, "Rent", isoDay(0));
  await page.goto("/transactions");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Transactions\s*1 to confirm/ })).toBeVisible();
  const toConfirm = page.getByRole("region", { name: "To confirm (1)" });
  await expect(toConfirm).toContainText("To confirm");
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹1,00,000.00"); // still not counted

  await page.goto("/transactions");
  await toConfirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("region", { name: /To confirm/ })).toHaveCount(0);
  await expect(nav.getByText("to confirm")).toHaveCount(0);
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹75,000.00");
});
