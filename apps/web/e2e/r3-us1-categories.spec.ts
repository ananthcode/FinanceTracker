import { expect, test } from "@playwright/test";
import { newSignedInMember } from "./helpers/accounts";
import { answerStartChoice, countRows, expandCategory, manageCategory, openCategories, pickCategory } from "./helpers/lists";

/** R3 T025 — User Story 1: nested categories (spec US1 scenarios 1–7; quickstart S1-a … S1-d; SC-001). */

test("the start choice adds the suggested Expense and Income trees once (S1-a)", async ({ page, request }) => {
  const email = await newSignedInMember(page, request, "cat-start");
  await page.goto("/settings/categories");
  const dialog = page.getByRole("dialog", { name: "How would you like to start?" });
  await expect(dialog.getByLabel("Start with suggested categories")).toBeChecked();
  await answerStartChoice(page);

  const expense = page.getByRole("region", { name: "Expense" });
  const income = page.getByRole("region", { name: "Income" });
  await expect(expense.getByRole("button", { name: "Manage Food & groceries", exact: true })).toBeVisible();
  await expect(income.getByRole("button", { name: "Manage Salary", exact: true })).toBeVisible();
  // Alphabetical at the top level (sub-categories start collapsed).
  const topLevel = await expense.locator("[data-category-name]").evaluateAll((rows) =>
    rows.map((r) => r.getAttribute("data-category-name")),
  );
  expect(topLevel.slice(0, 3)).toEqual(["Education", "Entertainment", "Family & social"]);
  expect(await countRows("categories", email)).toBe(74);

  // Never asked again, never added twice.
  await page.reload();
  await expect(page.getByRole("dialog", { name: "How would you like to start?" })).toBeHidden();
  expect(await countRows("categories", email)).toBe(74);
});

test("starting empty offers Add suggested categories (S1-d)", async ({ page, request }) => {
  const email = await newSignedInMember(page, request, "cat-empty");
  await openCategories(page, "empty");
  await expect(page.getByText("No expense categories yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add suggested categories" }).click();
  await expect(page.getByRole("button", { name: "Manage Salary", exact: true })).toBeVisible();
  expect(await countRows("categories", email)).toBe(74);
});

test("add nested categories, rename, move and find them by path (S1-b, US1 scenarios 2–7)", async ({ page, request }) => {
  test.slow(); // many steps through the UI
  await newSignedInMember(page, request, "cat-tree");
  await openCategories(page);

  // Add Education › Kids › Swimming classes (SC-001: a sub-category in under 30 seconds).
  const started = Date.now();
  await expandCategory(page, "Education");
  let panel = await manageCategory(page, "Education");
  await panel.getByRole("button", { name: "Add sub-category" }).click();
  panel = page.getByRole("dialog", { name: "Add a sub-category to Education" });
  await panel.getByLabel("Name").fill("Kids");
  await panel.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("button", { name: "Manage Kids", exact: true })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(30_000);

  panel = await manageCategory(page, "Kids");
  await panel.getByRole("button", { name: "Add sub-category" }).click();
  panel = page.getByRole("dialog", { name: "Add a sub-category to Kids" });
  await panel.getByLabel("Name").fill("Swimming classes");
  await panel.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("button", { name: "Manage Swimming classes", exact: true })).toBeVisible();

  // A sibling with the same name in another letter case is refused.
  panel = await manageCategory(page, "Kids");
  await panel.getByRole("button", { name: "Add sub-category" }).click();
  panel = page.getByRole("dialog", { name: "Add a sub-category to Kids" });
  await panel.getByLabel("Name").fill("swimming CLASSES");
  await panel.getByRole("button", { name: "Add category" }).click();
  await expect(panel.getByText(/already here/)).toBeVisible();
  await panel.getByRole("button", { name: "Cancel" }).click();

  // Rename Eating out → Restaurants.
  await expandCategory(page, "Food & groceries");
  panel = await manageCategory(page, "Eating out");
  await panel.getByRole("button", { name: "Edit name, colour or icon" }).click();
  panel = page.getByRole("dialog", { name: "Edit Eating out" });
  await panel.getByLabel("Name").fill("Restaurants");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Manage Restaurants", exact: true })).toBeVisible();

  // Move Pets to the top level; its own sub-categories are never offered as a destination.
  await expandCategory(page, "Family & social");
  panel = await manageCategory(page, "Pets");
  await panel.getByRole("button", { name: "Move" }).click();
  panel = page.getByRole("dialog", { name: "Move Pets" });
  await pickCategory(panel, "Move under", "top", "Top level (Expense)");
  await panel.getByRole("button", { name: "Move" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const expense = page.getByRole("region", { name: "Expense" });
  await expect(expense.locator(":scope > ul > li > div[data-category-name='Pets']")).toBeVisible();

  panel = await manageCategory(page, "Education");
  await panel.getByRole("button", { name: "Move" }).click();
  panel = page.getByRole("dialog", { name: "Move Education" });
  await panel.getByRole("combobox", { name: "Move under" }).fill("Swimming");
  await expect(panel.getByRole("option")).toHaveCount(0);
  await panel.getByRole("button", { name: "Cancel" }).click();

  // Search by any part of a name shows the full path.
  await page.getByLabel("Search categories").fill("swim");
  await expect(page.getByRole("button", { name: "Manage Education › Kids › Swimming classes", exact: true })).toBeVisible();
});
