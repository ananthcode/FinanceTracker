import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { addPerson } from "./helpers/lists";
import { isoMonth } from "./helpers/transactions";

/**
 * R4 T037 — User Story 4: interest on money lent to or borrowed from people (spec US4 1–5). Month
 * ends are simulated with an opening balance and a rate from two months ago: both have ended.
 */

const start = isoMonth(-2);

async function openPerson(page: Page, name: string) {
  await page.goto("/people");
  await page.locator(`[data-person-name='${name}']`).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 30_000 });
}

async function setInterest(page: Page, mode: "Automatic" | "Manual", ratePercent: string) {
  const interest = page.getByRole("region", { name: "Interest" });
  await expect(async () => {
    await interest.getByLabel(mode).check();
    await expect(interest.getByLabel("Rate % a month")).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await interest.getByLabel("From the month").fill(start.slice(0, 7));
  await interest.getByLabel("Rate % a month").fill(ratePercent);
  await interest.getByRole("button", { name: "Add rate" }).click();
  await expect(interest.getByRole("list", { name: "Monthly rates" })).toContainText(`${ratePercent}% a month`);
}

test("monthly proposals wait in To confirm; edits and deletes stand; later months follow (US4 1–4)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "txinterest");
  await addPerson(page, { name: "Ravi Kumar", amount: "1,00,000.00", direction: "They owe me", date: start });
  await openPerson(page, "Ravi Kumar");

  // A rate over 10% is refused (US4 1).
  const interest = page.getByRole("region", { name: "Interest" });
  await expect(async () => {
    await interest.getByLabel("Automatic").check();
    await expect(interest.getByLabel("Rate % a month")).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await interest.getByLabel("From the month").fill(start.slice(0, 7));
  await interest.getByLabel("Rate % a month").fill("11");
  await interest.getByRole("button", { name: "Add rate" }).click();
  await expect(interest.getByRole("alert")).toContainText("from 0 to 10");
  await setInterest(page, "Automatic", "1");

  // Opening the app proposes the two ended months (US4 2).
  await page.goto("/transactions");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Transactions\s*2 to confirm/ })).toBeVisible();
  const toConfirm = page.getByRole("region", { name: "To confirm (2)" });
  const rows = toConfirm.getByRole("listitem");
  await expect(rows.nth(0)).toContainText("Interest charged to Ravi Kumar");
  await expect(rows.nth(0)).toContainText("₹1,000.00");
  await expect(rows.nth(1)).toContainText("₹1,010.00"); // compounds on the waiting first month

  await page.goto("/people");
  await expect(page.locator("[data-person-name='Ravi Kumar']")).toContainText("owes you ₹1,00,000.00"); // not yet confirmed

  // Edit the first to ₹900.00 and confirm it (US4 3).
  await page.goto("/transactions");
  await rows.nth(0).getByRole("link", { name: "Interest charged to Ravi Kumar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit transaction" })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.getByLabel("Amount", { exact: true }).fill("900.00");
    await page.getByRole("button", { name: "Save and confirm" }).click();
    await expect(page).toHaveURL(/\/transactions$/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });

  // The second follows the new balance: 1,00,900.00 × 1% = 1,009.00.
  const one = page.getByRole("region", { name: "To confirm (1)" });
  await expect(one).toContainText("₹1,009.00");
  await one.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("region", { name: /To confirm/ })).toHaveCount(0);

  // A deleted proposal is never recreated, and the edited one stands.
  await page.reload();
  await expect(page.getByRole("region", { name: /To confirm/ })).toHaveCount(0);
  await page.goto("/people");
  await expect(page.locator("[data-person-name='Ravi Kumar']")).toContainText("owes you ₹1,00,900.00");
});

test("manual interest creates no entries; it is recorded by hand (US4 5)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "txmanual");
  await addPerson(page, { name: "Meera Iyer", amount: "50,000.00", direction: "I owe them", date: start });
  await openPerson(page, "Meera Iyer");
  await setInterest(page, "Manual", "1.5");

  await page.goto("/transactions");
  await expect(page.getByRole("region", { name: /To confirm/ })).toHaveCount(0);

  await openPerson(page, "Meera Iyer");
  await page.getByRole("link", { name: "Record interest" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add transaction" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("combobox", { name: "Person" })).toHaveValue("Meera Iyer");
  await page.getByLabel("I owe them interest").check();
  await page.getByLabel("Amount", { exact: true }).fill("750.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]+$/);
  await expect(page.getByRole("list", { name: "Movements" })).toContainText("Interest owed to Meera Iyer");
  await expect(page.getByText(/^Balance:/)).toContainText("you owe ₹50,750.00");
});
