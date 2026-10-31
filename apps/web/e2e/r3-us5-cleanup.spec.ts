import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { addPerson, expandCategory, manageCategory, openCategories, pickCategory } from "./helpers/lists";

/** R3 T062 — User Story 5: hide, merge and delete (spec US5 scenarios 1–6; quickstart S5-a … S5-c). */

async function addBusiness(page: Page, name: string, category?: [string, string], notes?: string) {
  await page.goto("/settings/payees/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  if (category) await pickCategory(page, "Default category (optional)", category[0], category[1]);
  if (notes) await page.getByLabel("Notes (optional)").fill(notes);
  await page.getByRole("button", { name: "Add payee" }).click();
  await expect(page).toHaveURL(/\/settings\/payees$/);
}

async function addSub(page: Page, parent: string, name: string) {
  const panel = await manageCategory(page, parent);
  await panel.getByRole("button", { name: "Add sub-category" }).click();
  const form = page.getByRole("dialog", { name: `Add a sub-category to ${parent}` });
  await form.getByLabel("Name").fill(name);
  await form.getByRole("button", { name: "Add category" }).click();
  await expect(form).toBeHidden();
}

const payeeRow = (page: Page, name: string) => page.getByRole("list", { name: "Payees" }).locator(`[data-payee-name='${name}']`);

test("hiding a category keeps it listed but out of pickers; unhiding restores it (US5 1, S5-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "hidecat");
  await openCategories(page);
  await expandCategory(page, "Education");
  let panel = await manageCategory(page, "Tuition & classes");
  await panel.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("[data-category-name='Tuition & classes']")).toContainText("Hidden");

  await page.goto("/settings/payees/new");
  const box = page.getByRole("combobox", { name: "Default category (optional)" });
  await box.click();
  await box.fill("tuition");
  await expect(page.getByRole("option", { name: "Education › Tuition & classes" })).toHaveCount(0);

  await page.goto("/settings/categories");
  await expandCategory(page, "Education");
  panel = await manageCategory(page, "Tuition & classes");
  await panel.getByRole("button", { name: "Unhide" }).click();
  await page.goto("/settings/payees/new");
  await pickCategory(page, "Default category (optional)", "tuition", "Education › Tuition & classes");
});

test("hidden payees leave the list until shown; hidden people still count (US5 2)", async ({ page, request }) => {
  await newSignedInMember(page, request, "hidepay");
  await addPerson(page, { name: "Ravi Kumar", amount: "1,000", direction: "They owe me" });
  await page.getByRole("link", { name: "Ravi Kumar" }).click();
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByText("This person is hidden")).toBeVisible();
  await page.goto("/people");
  await expect(page.getByText("Hidden people (1)")).toBeVisible();
  await expect(page.locator("#people-owe-you")).toHaveText("₹1,000.00");

  await page.goto("/settings/payees");
  await expect(payeeRow(page, "Ravi Kumar")).toHaveCount(0);
  await page.getByLabel("Show hidden").check();
  await expect(payeeRow(page, "Ravi Kumar")).toContainText("Hidden");
});

test("merging categories moves sub-categories and payee defaults (US5 3, S5-b)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "mergecat");
  await openCategories(page);
  await expandCategory(page, "Food & groceries");
  await addSub(page, "Eating out", "Weekend");
  await addSub(page, "Food delivery", "WEEKEND");
  await addBusiness(page, "Corner Cafe", ["weekend", "Food & groceries › Eating out › Weekend"]);

  await page.goto("/settings/categories");
  await expandCategory(page, "Food & groceries");
  const panel = await manageCategory(page, "Eating out");
  await panel.getByRole("button", { name: "Merge into another category" }).click();
  await pickCategory(panel, "Merge into", "delivery", "Food & groceries › Food delivery");
  await expect(panel.getByText("Weekend merges into WEEKEND")).toBeVisible();
  await expect(panel.getByText("1 payee get a new default category")).toBeVisible();
  await panel.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "Manage Eating out", exact: true })).toHaveCount(0);

  await page.goto("/settings/payees");
  await expect(payeeRow(page, "Corner Cafe")).toContainText("Default: Food & groceries › Food delivery › WEEKEND");
});

test("merging payees keeps the target and adds people's balances (US5 4, S5-b)", async ({ page, request }) => {
  await newSignedInMember(page, request, "mergepay");
  await addBusiness(page, "Fresh Mart", undefined, "Weekly");
  await addBusiness(page, "FreshMart", undefined, "Old account");
  await page.getByRole("link", { name: "FreshMart", exact: true }).click();
  await page.getByRole("button", { name: "Merge into another payee" }).click();
  const dialog = page.getByRole("dialog", { name: "Merge FreshMart into another payee" });
  await dialog.getByLabel("Merge into").selectOption({ label: "Fresh Mart" });
  await dialog.getByRole("button", { name: "Merge" }).click();
  await expect(page).toHaveURL(/\/settings\/payees$/);
  await expect(page.getByRole("list", { name: "Payees" }).locator("[data-payee-name]")).toHaveCount(1);

  await addPerson(page, { name: "Ravi Kumar", amount: "15,000", direction: "They owe me" });
  await addPerson(page, { name: "Ravi K", amount: "4,500", direction: "I owe them" });
  await page.getByRole("link", { name: "Ravi K", exact: true }).click();
  await page.getByRole("button", { name: "Merge into another person" }).click();
  const people = page.getByRole("dialog", { name: "Merge Ravi K into another person" });
  await people.getByLabel("Merge into").selectOption({ label: "Ravi Kumar" });
  await expect(people.getByText("Combined balance: owes you ₹10,500.00")).toBeVisible();
  await people.getByRole("button", { name: "Merge" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.locator("[data-person-name='Ravi Kumar']")).toContainText("owes you ₹10,500.00");
  await expect(page.locator("[data-person-name='Ravi K']")).toHaveCount(0);
});

test("delete: a used-nowhere leaf goes and payees lose it as default; a parent is refused (US5 5, S5-c)", async ({ page, request }) => {
  await newSignedInMember(page, request, "delcat");
  await openCategories(page);
  await addBusiness(page, "Pet Shop", ["pets", "Family & social › Pets"]);

  await page.goto("/settings/categories");
  await expandCategory(page, "Family & social");
  let panel = await manageCategory(page, "Family & social");
  await panel.getByRole("button", { name: "Delete" }).click();
  await expect(panel.getByText(/has sub-categories, so it can.t be deleted/)).toBeVisible();
  await panel.getByRole("button", { name: "Back" }).click();
  await panel.getByRole("button", { name: "Close" }).click();

  panel = await manageCategory(page, "Pets");
  await panel.getByRole("button", { name: "Delete" }).click();
  await expect(panel.getByText("1 payee loses it as their default category.")).toBeVisible();
  await panel.getByRole("button", { name: "Delete category" }).click();
  await expect(page.getByRole("button", { name: "Manage Pets", exact: true })).toHaveCount(0);

  await page.goto("/settings/payees");
  await expect(payeeRow(page, "Pet Shop")).not.toContainText("Default:");
});
