import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { isoDay, transactionRows } from "./helpers/transactions";

/** R9 T020 — User Story 2: what is under warranty (spec US2 1–6; quickstart S2-a – S2-c; FR-008 – FR-012). */

test("warranties list, reminders with Got it, marking a purchase, the filter and turning one off (S2-a, S2-c)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "warranty");
  await loadDemoFromSettings(page);

  // US2 2: the demo's two, soonest first, with the time left in words and whether a receipt is attached.
  await page.goto("/warranties");
  const active = page.locator("#warranties-active [data-warranty]");
  await expect(active).toHaveCount(2);
  await expect(active.nth(0)).toContainText("Refrigerator");
  await expect(active.nth(0)).toContainText("expires in 50 days");
  await expect(active.nth(0)).toContainText("Receipt attached");
  await expect(active.nth(1)).toContainText("Mobile phone");
  await expect(active.nth(1)).toContainText("No receipt attached");

  // US2 3: the first reminder (60 days by default) is on the Dashboard; Got it keeps it away, on reload too.
  await page.goto("/");
  const reminders = page.locator("#warranty-reminders");
  await expect(reminders.locator("[data-reminder]")).toHaveCount(1);
  await expect(reminders).toContainText("Refrigerator — warranty ends in 50 days.");
  await reminders.getByRole("button", { name: "Got it for Refrigerator" }).click();
  await expect(page.locator("#warranty-reminders")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#warranty-reminders")).toHaveCount(0);

  // US2 1: mark a purchase under warranty, ending in 20 days (inside the second reminder).
  await page.goto("/transactions?q=Wallet%20top-up");
  await transactionRows(page).first().getByRole("link").first().click();
  const warranty = page.locator("#warranty");
  await warranty.getByLabel("Under warranty").check();
  await warranty.getByLabel("Until").fill(isoDay(20));
  await warranty.getByLabel("Warranty note (optional)").fill("1 year, shop counter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/warranties");
  await expect(active).toHaveCount(3);
  await expect(active.nth(0)).toContainText("expires in 20 days");
  await expect(active.nth(0)).toContainText("1 year, shop counter");
  await page.goto("/");
  await expect(page.locator("#warranty-reminders [data-reminder]")).toHaveCount(1);
  await expect(page.locator("#warranty-reminders")).toContainText("warranty ends in 20 days");

  // US2 5: the filter shows only those.
  await page.goto("/transactions");
  await page.getByText("Filters", { exact: true }).click();
  await page.getByLabel("Under warranty").check();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/warranty=1/);
  await expect(transactionRows(page)).toHaveCount(3);
  await expect(transactionRows(page).locator("[data-under-warranty]")).toHaveCount(3);

  // US2 6: turned off, it leaves the list.
  await page.goto("/warranties");
  await active.nth(0).getByRole("link").click();
  await page.locator("#warranty").getByLabel("Under warranty").uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/warranties");
  await expect(active).toHaveCount(2);
});

test("reminder days are chosen in Settings and apply to every warranty (US2 4, S2-b)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "warrantydays");
  await loadDemoFromSettings(page);
  await page.goto("/settings");
  const first = page.getByLabel("First reminder");
  const second = page.getByLabel("Second reminder");
  await expect(first).toHaveValue("60");
  await expect(second).toHaveValue("30");
  // The second stays closer to expiry than the first.
  await first.selectOption("15");
  await expect(second).toHaveValue("off");
  await first.selectOption("30");
  await second.selectOption("15");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved. Every screen now uses these settings.")).toBeVisible();
  // 50 days left is outside a 30-day first reminder.
  await page.goto("/");
  await expect(page.locator("#warranty-reminders")).toHaveCount(0);

  await page.goto("/settings");
  await expect(first).toHaveValue("30");
  await first.selectOption("90");
  await second.selectOption("off");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved. Every screen now uses these settings.")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("#warranty-reminders")).toContainText("Refrigerator — warranty ends in 50 days.");
});
