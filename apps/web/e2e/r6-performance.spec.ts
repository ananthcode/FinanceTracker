import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { seedManyTransactions } from "./helpers/transactions";
import { createMember } from "./helpers/users";

/**
 * R6 T022 — SC-003: with 20,000 transactions the Dashboard is complete within 2 seconds, and each
 * report step (a period, a drill level) within 1 second.
 *
 * Runs only against a production build (E2E_PRODUCTION=1), as the R2–R4 performance checks.
 */
test.skip(process.env.E2E_PRODUCTION !== "1", "SC-003 is measured against a production build (E2E_PRODUCTION=1)");

async function timed(page: Page, label: string, limit: number, step: () => Promise<void>) {
  const started = Date.now();
  await step();
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: "elapsed", description: `${label}: ${elapsed} ms` });
  console.log(`SC-003 ${label}: ${elapsed} ms`);
  expect(elapsed, `${label} took ${elapsed} ms`).toBeLessThan(limit);
}

test("Dashboard < 2 s and each report step < 1 s with 20,000 transactions (SC-003)", async ({ page, request }) => {
  test.setTimeout(240_000); // seeding 20,000 rows
  await ensureOwner(request);
  const member = uniqueEmail("perfrpt");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  await seedManyTransactions(member, 20_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  // First visits warm server caches.
  await page.goto("/");
  await page.goto("/reports?view=spending&period=last_12_months");

  await page.goto("/settings");
  await timed(page, "Dashboard", 2000, async () => {
    await page.goto("/");
    await expect(page.locator("#dash-net-worth")).toContainText("₹");
    await expect(page.locator("#figure-safe")).toContainText("₹");
  });

  await timed(page, "period", 1000, async () => {
    await page.goto("/reports?view=spending&period=this_fy");
    await expect(page.locator("#report-level-total")).toContainText("₹");
  });
  await timed(page, "category level", 1000, async () => {
    await page.getByRole("list", { name: "Spending by category" }).getByRole("link").first().click();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "All spending" })).toBeVisible();
  });
  await timed(page, "trend", 1000, async () => {
    await page.goto("/reports?view=trend&period=last_12_months");
    await expect(page.locator("table tbody tr")).toHaveCount(12);
  });
});
