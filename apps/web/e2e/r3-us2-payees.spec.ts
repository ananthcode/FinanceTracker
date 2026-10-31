import { expect, test } from "@playwright/test";
import { newSignedInMember } from "./helpers/accounts";
import { answerStartChoice, expandCategory, manageCategory, openCategories, pickCategory } from "./helpers/lists";

/** R3 T037 — User Story 2: payees with a default category (spec US2 scenarios 1–4; quickstart S2-a; SC-001). */

async function addBusiness(page: import("@playwright/test").Page, name: string, category?: [string, string], notes?: string) {
  await page.goto("/settings/payees/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  if (category) await pickCategory(page, "Default category (optional)", category[0], category[1]);
  if (notes) await page.getByLabel("Notes (optional)").fill(notes);
  await page.getByRole("button", { name: "Add payee" }).click();
}

test("a first category picker asks the start choice before offering categories (FR-007)", async ({ page, request }) => {
  await newSignedInMember(page, request, "payee-start");
  await page.goto("/settings/payees/new");
  await page.getByRole("combobox", { name: "Default category (optional)" }).click();
  await answerStartChoice(page);
  await pickCategory(page, "Default category (optional)", "electric", "Utilities & bills › Electricity");
  await expect(page.getByRole("combobox", { name: "Default category (optional)" })).toHaveValue("Utilities & bills › Electricity");
});

test("add payees with a default category and notes; names are unique; search filters (US2 1–4, S2-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "payee-add");
  await openCategories(page);

  const started = Date.now();
  await addBusiness(page, "Fresh Mart", ["grocer", "Food & groceries › Groceries"], "Weekly vegetables");
  await expect(page).toHaveURL(/\/settings\/payees$/);
  expect(Date.now() - started).toBeLessThan(30_000); // SC-001

  await addBusiness(page, "City Power Board", ["electric", "Utilities & bills › Electricity"]);
  await expect(page).toHaveURL(/\/settings\/payees$/);

  const list = page.getByRole("list", { name: "Payees" });
  await expect(list.locator("[data-payee-name='Fresh Mart']")).toContainText("Default: Food & groceries › Groceries");
  await expect(list.locator("[data-payee-name='City Power Board']")).toContainText("Default: Utilities & bills › Electricity");

  // A name that differs only in case is refused and the existing payee is suggested.
  await addBusiness(page, "fresh mart");
  await expect(page.getByText("You already have a payee with this name.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Fresh Mart" })).toBeVisible();

  // Search as you type.
  await page.goto("/settings/payees");
  await page.getByLabel("Search payees").fill("power");
  await expect(list.locator("[data-payee-name]")).toHaveCount(1);
  await expect(list.getByRole("link", { name: "City Power Board" })).toBeVisible();

  // Renaming the default category shows its new path on the payee.
  await page.goto("/settings/categories");
  await expandCategory(page, "Food & groceries");
  let panel = await manageCategory(page, "Groceries");
  await panel.getByRole("button", { name: "Edit name, colour or icon" }).click();
  panel = page.getByRole("dialog", { name: "Edit Groceries" });
  await panel.getByLabel("Name").fill("Daily groceries");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Manage Daily groceries", exact: true })).toBeVisible();
  await page.goto("/settings/payees");
  await expect(list.locator("[data-payee-name='Fresh Mart']")).toContainText("Default: Food & groceries › Daily groceries");
});
