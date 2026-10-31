import { expect, test } from "./fixtures";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { seedManyTransactions } from "./helpers/transactions";
import { createMember } from "./helpers/users";

/**
 * R4 T056 — SC-003: with 20,000 transactions the list opens within 2 seconds and search or a filter
 * shows its matches within 1 second; balances on Accounts stay within 2 seconds.
 *
 * Runs only against a production build, like R2's and R3's (E2E_PRODUCTION=1 and WEB_BASE_URL; the
 * R2 quickstart's Performance section).
 */
test.skip(process.env.E2E_PRODUCTION !== "1", "SC-003 is measured against a production build (E2E_PRODUCTION=1)");

test("the transactions list, search and filters stay fast with 20,000 transactions (SC-003)", async ({ page, request }) => {
  test.setTimeout(300_000); // seeding 20,000 rows through the triggers
  await ensureOwner(request);
  const member = uniqueEmail("perftx");
  await createMember(request, member);
  await seedAccounts(member, { demo: true });
  await seedLists(member, { demo: true });
  await seedManyTransactions(member, 20_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInUI(page, member);
  for (const path of ["/transactions", "/accounts", "/transactions?q=note"]) await page.goto(path); // warm caches

  const timings: Record<string, number> = {};
  const time = async (label: string, run: () => Promise<void>) => {
    const started = Date.now();
    await run();
    timings[label] = Date.now() - started;
  };
  const list = page.getByRole("list", { name: "Transactions", exact: true });

  await page.goto("/settings");
  await time("transactions list", async () => {
    await page.goto("/transactions");
    await expect(list.getByRole("listitem")).toHaveCount(50);
  });
  await time("load more", async () => {
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(100);
  });
  await time("text search", async () => {
    await page.goto("/transactions?q=Seeded%20note%2019950"); // every 50th has a note
    await expect(page.getByText(/^1 transaction\b/)).toBeVisible();
  });
  await time("type and date filter", async () => {
    await page.goto(`/transactions?type=income&from=2025-01-01`);
    await expect(page.getByText(/[\d,]+ transactions/)).toBeVisible();
  });
  await page.goto("/settings");
  await time("accounts with balances", async () => {
    await page.goto("/accounts");
    await expect(page.locator("#figure-net-worth")).toBeVisible();
  });

  console.log(`SC-003 timings (ms): ${JSON.stringify(timings)}`);
  for (const [label, ms] of Object.entries(timings)) test.info().annotations.push({ type: label, description: `${ms} ms` });
  expect(timings["transactions list"]).toBeLessThan(2000);
  expect(timings["accounts with balances"]).toBeLessThan(2000);
  expect(timings["load more"]).toBeLessThan(1000);
  expect(timings["text search"]).toBeLessThan(1000);
  expect(timings["type and date filter"]).toBeLessThan(1000);
});
