import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { openPlan, paise, planRow, thisMonth } from "./helpers/plan";
import { accountRow, pickPayee } from "./helpers/transactions";

/**
 * R7 T025 — User Story 3: pay or link, never twice (spec US3 1–8; quickstart S3-a – S3-e; SC-002, SC-004;
 * FR-010 – FR-013, FR-020).
 */

const payments = (row: ReturnType<typeof planRow>) => row.getByRole("list", { name: /^Payments for/ }).getByRole("listitem");

test("Pay records one transaction and marks the item paid; part payments add up; void and unlink undo it (US3 1, 4, 5, S3-a, S3-b, S3-e)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planpay");
  await loadDemoFromSettings(page);
  await page.goto("/accounts");
  const before = paise(await accountRow(page, "Everyday Savings").innerText());

  // S3-a / SC-004: Pay, check, Save — two selections here.
  await openPlan(page);
  const emi = planRow(page, "Home loan EMI");
  await expect(emi).not.toHaveAttribute("data-status", "paid");
  await emi.getByRole("link", { name: /^Pay/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pay Home loan EMI" })).toBeVisible();
  await expect(page.locator("#pays-plan")).toContainText(`Pays: Home loan EMI (${monthName(thisMonth)})`);
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("42500.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/payment-plan\?month=/);
  await expect(emi).toHaveAttribute("data-status", "paid");
  await expect(payments(emi)).toHaveCount(1);

  // SC-002: one transaction; the account's balance changed once, by exactly the amount.
  await page.goto("/accounts");
  expect(before - paise(await accountRow(page, "Everyday Savings").innerText())).toBe(4_250_000n);

  // S3-b: ₹2,000.00 of ₹5,000.00, then Pay pre-fills the ₹3,000.00 left.
  await openPlan(page);
  const meera = planRow(page, "Repay Meera");
  await meera.getByRole("link", { name: /^Pay/ }).click();
  await page.getByLabel("Amount", { exact: true }).fill("2,000.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/payment-plan\?month=/);
  await expect(meera).toContainText("₹3,000.00 left");
  await expect(meera).toHaveAttribute("data-status", /^(part_paid|overdue)$/);
  await meera.getByRole("link", { name: /^Pay/ }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("3000.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(meera).toHaveAttribute("data-status", "paid");
  await expect(payments(meera)).toHaveCount(2);

  // S3-e / FR-020: the transaction says what it pays, and warns before it is voided.
  await payments(emi).first().getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit transaction" })).toBeVisible();
  await expect(page.getByLabel(`Pays: Home loan EMI (${monthName(thisMonth)})`)).toBeChecked();
  await page.getByLabel("Status").selectOption({ label: "Void" });
  await expect(page.getByText("Voiding this transaction makes Home loan EMI")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await openPlan(page);
  await expect(emi).not.toHaveAttribute("data-status", "paid");
  await expect(payments(emi)).toHaveCount(0);

  // Deleting warns too (not confirmed here).
  await payments(meera).first().getByRole("link").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this transaction?" })).toContainText("It pays Repay Meera");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // US3 5: unlinking leaves the transaction; its amount leaves what is paid.
  await page.getByLabel(`Pays: Repay Meera (${monthName(thisMonth)})`).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await openPlan(page);
  await expect(meera).not.toHaveAttribute("data-status", "paid");
  await expect(payments(meera)).toHaveCount(1);
});

test("Looks paid — link?, Pays: in the add form, Link existing, and a linked transaction is refused (US3 2, 3, 7, 8, S3-c, S3-d)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planlink");
  await loadDemoFromSettings(page);

  // S3-d: last month's electricity was paid but not linked; one selection links it and it leaves Carried over.
  await openPlan(page);
  const carried = page.locator("#plan-carried [data-name='Electricity']");
  await expect(carried.locator("[data-looks-paid]")).toBeVisible();
  await carried.getByRole("button", { name: /^Looks paid — link\?/ }).click();
  await expect(page.locator("#plan-carried [data-name='Electricity']")).toHaveCount(0);

  // S3-c: a new expense that matches an unpaid planned payment offers "Pays:", ticked.
  const stream = planRow(page, "Stream Plus");
  await expect(stream).not.toHaveAttribute("data-status", "paid");
  await page.goto("/transactions/new");
  await pickPayee(page, "Payee (optional)", "Stream", "Stream Plus");
  await page.getByLabel("Paid from").selectOption({ label: "Rewards Card" });
  await page.getByLabel("Amount", { exact: true }).fill("649.00");
  const pays = page.getByRole("group", { name: "Pays a planned payment?" });
  await expect(pays.getByRole("radio", { name: new RegExp(`^Pays: Stream Plus \\(${monthName(thisMonth)}\\)`) })).toBeChecked();
  await expect(pays.getByRole("radio", { name: "None" })).not.toBeChecked();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await openPlan(page);
  await expect(stream).toHaveAttribute("data-status", "paid");

  // US3 2, 3: Link existing — a transaction that already pays another item is shown but cannot be chosen.
  const fees = planRow(page, "School fees");
  const linkedBefore = await payments(fees).count();
  await fees.getByRole("button", { name: /^Link existing/ }).click();
  const dialog = page.getByRole("dialog", { name: "Link a payment to School fees" });
  await dialog.getByLabel("Search transactions").fill("Rent");
  await dialog.getByRole("button", { name: "Search" }).click();
  const taken = dialog.locator("[data-link-candidate]").filter({ hasText: "Already pays Rent" }).first();
  await expect(taken).toBeVisible();
  await expect(taken.getByRole("button", { name: "Link" })).toBeDisabled();

  // Any other transaction can be searched for and linked; nothing new is recorded.
  await dialog.getByLabel("Search transactions").fill("Fresh Mart");
  await dialog.getByRole("button", { name: "Search" }).click();
  const free = dialog.locator("[data-link-candidate]").filter({ hasNotText: "Already pays" }).first();
  await free.getByRole("button", { name: "Link" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(payments(fees)).toHaveCount(linkedBefore + 1);
});
