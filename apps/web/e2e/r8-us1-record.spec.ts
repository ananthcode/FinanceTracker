import type { Page } from "@playwright/test";
import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { openPlan, paise, planRow, thisMonth } from "./helpers/plan";
import { accountRow, isoDay, transactionRows } from "./helpers/transactions";

/**
 * R8 T015 — User Story 1: record a frequent transaction in one tap (spec US1 1–10; quickstart S1-a – S1-e;
 * SC-001, SC-002; FR-007 – FR-012).
 */

const card = (page: Page, name: string) => page.locator("#quick-add").locator(`[data-template='${name}']`);
const done = (page: Page) => page.locator("#quick-add-done");

/** How many transactions are dated today (the list shows the count when filtered). */
async function todayCount(page: Page): Promise<number> {
  await page.goto(`/transactions?from=${isoDay(0)}&to=${isoDay(0)}`);
  const text = await page.getByText(/^\d[\d,]* transactions?/).first().innerText();
  return Number(text.match(/^[\d,]+/)![0].replace(/,/g, ""));
}

async function balance(page: Page, account: string): Promise<bigint> {
  await page.goto("/accounts");
  return paise(await accountRow(page, account).locator("[data-account-balance]").or(accountRow(page, account)).first().innerText());
}

test("Record makes one transaction for today; Undo removes it; a repeat asks first (US1 1, 2, 8, S1-a, S1-b, S1-d, SC-001, SC-002)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "tplrecord");
  await loadDemoFromSettings(page);
  const before = await balance(page, "Cash in hand");

  const count = await todayCount(page);
  await page.goto("/transactions");
  const milk = card(page, "Milk");
  await expect(milk.getByLabel("Amount for Milk")).toHaveValue("60.00");
  await milk.getByRole("button", { name: "Record Milk" }).click(); // one selection (SC-001)
  await expect(done(page)).toHaveText("Recorded Milk, ₹60.00, today");
  await expect(transactionRows(page).filter({ hasText: "Spent at Sunrise Dairy" }).first()).toBeVisible();

  // A repeat within 10 seconds asks; cancelling records nothing.
  await milk.getByRole("button", { name: "Record Milk" }).click();
  const again = page.getByRole("dialog", { name: "Record it again?" });
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(again).toHaveCount(0);
  expect(await todayCount(page)).toBe(count + 1);

  // SC-002: the balance changed once, by exactly the amount.
  const after = await balance(page, "Cash in hand");
  expect(before - after).toBe(6_000n);

  // Undo (within 10 seconds) removes it, and the balance is exactly as before.
  await page.goto("/transactions");
  await card(page, "Milk").getByRole("button", { name: "Record Milk" }).click();
  await expect(done(page)).toBeVisible();
  await page.getByRole("status").filter({ has: done(page) }).getByRole("button", { name: "Undo" }).click();
  await expect(done(page)).toHaveCount(0);
  expect(await balance(page, "Cash in hand")).toBe(after);
});

test("the amount box: type for amounts that vary, change it for this time only; Edit first opens the form (US1 3, 4, 6, S1-c)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "tplamount");
  await loadDemoFromSettings(page);
  await page.goto("/transactions");

  // Groceries has no usual amount: the box is empty; Record without an amount is refused.
  const groceries = card(page, "Groceries");
  await expect(groceries.getByLabel("Amount for Groceries")).toHaveValue("");
  await groceries.getByRole("button", { name: "Record Groceries" }).click();
  await expect(groceries).toContainText("Enter the amount.");
  await groceries.getByLabel("Amount for Groceries").fill("1,240.00");
  await groceries.getByRole("button", { name: "Record Groceries" }).click(); // two selections with typing (SC-001)
  await expect(done(page)).toHaveText("Recorded Groceries, ₹1,240.00, today");

  // A different amount for Milk this time; the template keeps ₹60.00.
  await card(page, "Milk").getByLabel("Amount for Milk").fill("75.00");
  await card(page, "Milk").getByRole("button", { name: "Record Milk" }).click();
  await expect(done(page)).toHaveText("Recorded Milk, ₹75.00, today");
  await page.reload();
  await expect(card(page, "Milk").getByLabel("Amount for Milk")).toHaveValue("60.00");

  // Edit first: the form, filled in; nothing is recorded until Save.
  const count = await todayCount(page);
  await page.goto("/transactions");
  await card(page, "Fuel").getByRole("link", { name: "Edit first Fuel" }).click();
  await expect(page.getByText("From the template Fuel.")).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("2500.00");
  await expect(page.getByLabel("Paid from")).toHaveValue(/.+/);
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(isoDay(0));
  await page.getByLabel("Amount", { exact: true }).fill("2,800.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  expect(await todayCount(page)).toBe(count + 1);
});

test("a template tied to a planned payment pays it in one tap (US1 9, S1-e; clarify Q1)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "tpltie");
  await loadDemoFromSettings(page);
  await openPlan(page);
  await expect(planRow(page, "Repay Meera")).not.toHaveAttribute("data-status", "paid");

  await page.goto("/transactions");
  await card(page, "Repay Meera").getByRole("button", { name: "Record Repay Meera" }).click();
  await expect(done(page)).toHaveText(`Recorded Repay Meera, ₹5,000.00, today · pays Repay Meera (${monthName(thisMonth)})`);

  await openPlan(page);
  await expect(planRow(page, "Repay Meera")).toHaveAttribute("data-status", "paid");

  // Nothing left this month: the next recording is still made, unlinked, and says why.
  await page.goto("/transactions");
  await card(page, "Repay Meera").getByRole("button", { name: "Record Repay Meera" }).click();
  await expect(done(page)).toHaveText(`Recorded Repay Meera, ₹5,000.00, today · not linked: Repay Meera is already paid for ${monthName(thisMonth)}`);
});
