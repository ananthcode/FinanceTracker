import { demoLists } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings, yourData } from "./helpers/data";
import { accountRow } from "./helpers/transactions";

/** R5 T009 — User Story 1: load the demo household (spec US1 1–4; quickstart S1-a; SC-001, SC-004). */

test("an empty user loads the demo household from Settings and every screen shows it (US1 1, 3, 4, S1-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "demoload");
  await page.goto("/settings");
  await expect(yourData(page).getByRole("button", { name: "Reset my data" })).toHaveCount(0); // nothing to reset yet

  const started = Date.now();
  await loadDemoFromSettings(page);
  expect(Date.now() - started).toBeLessThan(10_000); // SC-001
  const { categories } = demoLists();
  await expect(yourData(page).getByRole("status")).toContainText(`8 accounts, ${categories.length} categories, 13 payees and people, 5 tags`);

  // US1 4: with data, the demo is no longer offered on its own (as the server now says).
  await page.reload();
  await expect(yourData(page).getByRole("button", { name: "Load demo data", exact: true })).toHaveCount(0);
  await expect(yourData(page).getByRole("button", { name: "Reset and load demo data" })).toBeVisible();

  // SC-004: every screen has content.
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toBeVisible();
  await page.goto("/people");
  await expect(page.locator("[data-person-name='Ravi Kumar']")).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByRole("region", { name: /To confirm/ })).toBeVisible(); // US1 3
  await expect(page.getByRole("list", { name: "Transactions", exact: true }).getByRole("listitem").first()).toBeVisible();
  await page.goto("/settings/categories");
  await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "How would you like to start?" })).toHaveCount(0); // FR-006
  await expect(page.getByRole("button", { name: "Manage Food & groceries", exact: true })).toBeVisible();
  await page.goto("/settings/payees");
  await expect(page.getByRole("link", { name: "Fresh Mart", exact: true })).toBeVisible();
  await page.goto("/settings/tags");
  await expect(page.getByText("Diwali 2025")).toBeVisible();
});
