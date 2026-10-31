import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { confirmReset, loadDemoFromSettings, yourData } from "./helpers/data";

/** R5 T015 — User Story 2: reset / clear my data (spec US2 1–3, 5; quickstart S2-a, S2-b). */

test("reset asks for the word, clears every record and keeps the user signed in with their preferences (US2 1–3, S2-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "demoreset");
  await page.goto("/settings");
  await page.getByLabel("International (1,234,567)").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved. Every screen now uses these settings.")).toBeVisible();
  await loadDemoFromSettings(page);

  // US2 1: the warning says what goes; the button waits for the exact word.
  await yourData(page).getByRole("button", { name: "Reset my data" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset your data?" });
  await expect(dialog).toContainText("cannot be undone");
  await expect(dialog).toContainText("Your sign-in, profile and preferences stay.");
  const confirm = dialog.getByRole("button", { name: "Reset my data" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type RESET to confirm").fill("reset");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await confirmReset(page, "Reset my data");
  await expect(yourData(page).getByRole("status")).toContainText("Your data was reset: 8 accounts");
  await expect(yourData(page).getByRole("button", { name: "Load demo data" })).toBeVisible();

  // Every screen is in its first-use state; still signed in; preferences kept.
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "No accounts yet" })).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "No transactions yet" })).toBeVisible();
  await page.goto("/settings/categories");
  await expect(page.getByRole("dialog", { name: "How would you like to start?" })).toBeVisible(); // US2 3
  await page.goto("/settings");
  await expect(page.getByLabel("International (1,234,567)")).toBeChecked();
});

test("another open tab shows the reset state when it reloads (US2 5, S2-b)", async ({ page, request, context }) => {
  test.slow();
  await newSignedInMember(page, request, "demoresettabs");
  await loadDemoFromSettings(page);
  const other = await context.newPage();
  await other.goto("/accounts");
  await expect(other.locator("[data-account-row]").first()).toBeVisible();

  await page.goto("/settings");
  await confirmReset(page, "Reset my data");
  await expect(yourData(page).getByRole("status")).toContainText("Your data was reset");

  await other.reload();
  await expect(other.getByRole("heading", { name: "No accounts yet" })).toBeVisible();
});
