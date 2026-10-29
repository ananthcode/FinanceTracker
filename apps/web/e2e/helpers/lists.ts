import { expect, type Locator, type Page } from "@playwright/test";
import { admin } from "./db";

/** R3 e2e helpers: categories, payees and people through the real UI. Synthetic data only. */

/** Answers the one-time start choice (it opens on Settings › Categories or from a picker). */
export async function answerStartChoice(page: Page, choice: "suggested" | "empty" = "suggested"): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "How would you like to start?" });
  await expect(dialog).toBeVisible();
  if (choice === "empty") await dialog.getByLabel("Start empty").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toBeHidden();
}

/** A new member's first visit to Settings › Categories: waits for the start choice and answers it. */
export async function openCategories(page: Page, choice: "suggested" | "empty" = "suggested"): Promise<void> {
  await page.goto("/settings/categories");
  await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();
  await answerStartChoice(page, choice);
}

/** The tree row of a category (by its own name, or its full path in search results). */
export function categoryRow(page: Page, label: string): Locator {
  return page.getByRole("button", { name: `Manage ${label}`, exact: true });
}

/** Opens a category's Manage panel; the category must be visible (expand its parents first). */
export async function manageCategory(page: Page, label: string): Promise<Locator> {
  await categoryRow(page, label).click();
  return page.getByRole("dialog");
}

/** Expands a category's sub-categories in the tree. */
export async function expandCategory(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole("button", { name: `Show sub-categories of ${name}`, exact: true });
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
}

/** Chooses an option in a CategoryPicker by typing part of its name. */
export async function pickCategory(scope: Page | Locator, label: string, query: string, option: string): Promise<void> {
  const box = scope.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(query);
  await scope.getByRole("option", { name: option, exact: true }).click();
}

export async function userIdOf(email: string): Promise<string> {
  const { data } = await admin().from("profiles").select("user_id").eq("email", email).single();
  return data!.user_id as string;
}

export async function countRows(table: "categories" | "payees" | "tags", email: string): Promise<number> {
  const { count } = await admin()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", await userIdOf(email))
    .neq("state", "deleted");
  return count ?? 0;
}
