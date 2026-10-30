import { expect, test } from "@playwright/test";
import { seedLists, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember } from "./helpers/users";

/**
 * R3 T074 — SC-002: with 500 categories and 2,000 payees, the Categories and Payees screens open
 * within 2 seconds and picker / search matches show within 1 second.
 *
 * Runs only against a production build, like R2's SC-003 test (E2E_PRODUCTION=1 and WEB_BASE_URL;
 * quickstart.md § Performance).
 */
test.skip(process.env.E2E_PRODUCTION !== "1", "SC-002 is measured against a production build (E2E_PRODUCTION=1)");

test("categories, payees and the picker stay fast with 500 categories and 2,000 payees (SC-002)", async ({ page, request }) => {
  test.slow();
  await ensureOwner(request);
  const member = uniqueEmail("perflists");
  await createMember(request, member);
  await seedLists(member, { categories: 500, payees: 2000 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  for (const path of ["/settings/categories", "/settings/payees", "/settings/payees/new"]) await page.goto(path); // warm caches

  const timings: Record<string, number> = {};
  const time = async (label: string, run: () => Promise<void>) => {
    const started = Date.now();
    await run();
    timings[label] = Date.now() - started;
  };

  await page.goto("/settings");
  await time("categories screen", async () => {
    await page.goto("/settings/categories");
    await expect(page.getByRole("button", { name: "Manage Seeded group 50", exact: true })).toBeVisible();
  });
  await time("category search", async () => {
    await page.getByLabel("Search categories").fill("category 499");
    await expect(page.getByRole("button", { name: "Manage Seeded group 50 › Seeded category 499", exact: true })).toBeVisible();
  });

  await page.goto("/settings");
  await time("payees screen", async () => {
    await page.goto("/settings/payees");
    await expect(page.getByText("2000 payees")).toBeVisible();
  });
  await time("payee search", async () => {
    await page.getByLabel("Search payees").fill("payee 1999");
    await expect(page.getByText("1 payee", { exact: true })).toBeVisible();
  });

  await page.goto("/settings/payees/new");
  const box = page.getByRole("combobox", { name: "Default category (optional)" });
  await box.click();
  await time("picker search", async () => {
    await box.fill("category 377");
    await expect(page.getByRole("option", { name: "Seeded group 38 › Seeded category 377", exact: true })).toBeVisible();
  });

  console.log(`SC-002 timings (ms): ${JSON.stringify(timings)}`);
  for (const [label, ms] of Object.entries(timings)) test.info().annotations.push({ type: label, description: `${ms} ms` });
  expect(timings["categories screen"]).toBeLessThan(2000);
  expect(timings["payees screen"]).toBeLessThan(2000);
  expect(timings["category search"]).toBeLessThan(1000);
  expect(timings["payee search"]).toBeLessThan(1000);
  expect(timings["picker search"]).toBeLessThan(1000);
});
