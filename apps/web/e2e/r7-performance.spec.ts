import type { Page } from "@playwright/test";
import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { monthAfter, monthParam, seedManyPlanItems, thisMonth } from "./helpers/plan";
import { createMember } from "./helpers/users";

/**
 * R7 T038 — SC-003: with 100 plan items and 24 months of paid history, the plan screen is complete
 * within 2 seconds and moving to another month within 1 second.
 *
 * Runs only against a production build (E2E_PRODUCTION=1), as the R2–R6 performance checks.
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

test("plan < 2 s and a month change < 1 s with 100 items and 24 months of links (SC-003)", async ({ page, request }) => {
  test.setTimeout(240_000); // seeding 2,400 linked transactions
  await ensureOwner(request);
  const member = uniqueEmail("perfplan");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  await seedManyPlanItems(member, 100, 24);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  // First visits warm server caches.
  await page.goto("/payment-plan");
  await page.goto(`/payment-plan?month=${monthParam(monthAfter(-1))}`);

  await page.goto("/settings");
  await timed(page, "plan screen", 2000, async () => {
    await page.goto("/payment-plan");
    await expect(page.locator("#plan-month")).toHaveText(monthName(thisMonth));
    await expect(page.locator("table").first().locator("[data-plan-row]")).toHaveCount(100);
  });
  await timed(page, "month change", 1000, async () => {
    await page.getByRole("link", { name: `Previous month, ${monthName(monthAfter(-1))}` }).click();
    await expect(page.locator("#plan-month")).toHaveText(monthName(monthAfter(-1)));
    await expect(page.locator("table").first().locator("[data-plan-row][data-status='paid']")).toHaveCount(100);
  });
});
