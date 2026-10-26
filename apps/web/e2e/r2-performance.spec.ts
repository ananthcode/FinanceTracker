import { expect, test } from "@playwright/test";
import { seedAccounts, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember } from "./helpers/users";

/**
 * T065 — SC-003: with 50 active and 50 archived accounts, the accounts screen shows every balance
 * and the net-worth summary within 2 seconds of opening it.
 *
 * Runs only against a production build (`next build` + `next start`), selected with
 * E2E_PRODUCTION=1 and WEB_BASE_URL. The development server renders React in its slow debug mode
 * and is not what users run (quickstart.md, Automated checks).
 */
test.skip(process.env.E2E_PRODUCTION !== "1", "SC-003 is measured against a production build (E2E_PRODUCTION=1)");

test("accounts screen with 100 accounts is complete within 2 seconds (SC-003)", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("perf");
  await createMember(request, member);
  await seedAccounts(member, { active: 50, archived: 50 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  await page.goto("/accounts"); // first visit warms server caches
  await expect(page.locator("[data-account-row]")).toHaveCount(100); // 50 active + 50 archived rows

  await page.goto("/settings");
  const started = Date.now();
  await page.goto("/accounts");
  await expect(page.locator("#figure-net-worth dd")).toContainText("₹");
  await expect(page.locator("[data-account-row]")).toHaveCount(100);
  await expect(page.locator("#archived summary")).toContainText("Archived accounts (50)");
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: "elapsed", description: `${elapsed} ms` });
  console.log(`SC-003 accounts screen: ${elapsed} ms`);
  expect(elapsed, `took ${elapsed} ms`).toBeLessThan(2000);
});
