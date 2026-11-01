import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists } from "./helpers/db";
import { seedDemoTransactions } from "./helpers/transactions";

/** R6 T010 — User Story 1: the Dashboard (spec US1 1–4; quickstart S1-a, S1-b; SC-001). */

/** "₹1,83,765.50" → 18376550 (paise), for comparing figures exactly. */
const paise = (text: string) => BigInt(text.replace(/[^\d]/g, ""));

test("a new user's Dashboard explains what will appear and offers the first steps (US1 4)", async ({ page, request }) => {
  await newSignedInMember(page, request, "dashempty");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Load demo data" })).toBeVisible();
});

test("figures equal the Accounts, People and Transactions screens; the buffer moves safe to spend (US1 1–3, S1-a, S1-b, SC-001)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "dash");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);

  await page.goto("/accounts");
  const accounts = {
    owned: paise(await page.locator("#figure-owned").innerText()),
    owed: paise(await page.locator("#figure-owed").innerText()),
    net: paise(await page.locator("#figure-net-worth").innerText()),
  };
  await page.goto("/people");
  const people = {
    owe: paise(await page.locator("#people-owe-you").innerText()),
    owed: paise(await page.locator("#you-owe-people").innerText()),
  };

  await page.goto("/");
  await expect(page.locator("#dash-owned")).toBeVisible();
  expect(paise(await page.locator("#dash-owned").innerText())).toBe(accounts.owned);
  expect(paise(await page.locator("#dash-owed").innerText())).toBe(accounts.owed);
  expect(paise(await page.locator("#dash-net-worth").innerText())).toBe(accounts.net);
  expect(paise(await page.locator("#dash-people-owe-you").innerText())).toBe(people.owe);
  expect(paise(await page.locator("#dash-you-owe-people").innerText())).toBe(people.owed);
  await expect(page.locator("#dash-to-confirm")).toContainText("transaction");

  // US1 2: each figure opens its screen.
  await page.locator("a", { has: page.locator("#dash-to-confirm") }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  // US1 3: safe to spend lists its parts; a ₹5,000.00 buffer lowers it by exactly that (when it stays above zero).
  await page.goto("/");
  const safe = page.getByRole("region", { name: "Safe to spend" });
  await expect(safe).toContainText("Less owed on cards");
  await expect(safe).toContainText("Less still to pay this month");
  const before = paise(await page.locator("#figure-safe").innerText());
  await safe.getByRole("button", { name: "Change buffer" }).click();
  await safe.getByLabel("Buffer to keep").fill("5,000.00");
  await safe.getByRole("button", { name: "Save buffer" }).click();
  await expect(safe.getByRole("button", { name: "Change buffer" })).toBeVisible();
  const expected = before > 500_000n ? before - 500_000n : 0n;
  await expect.poll(async () => paise(await page.locator("#figure-safe").innerText())).toBe(expected);

  // FR-003: the same buffer is in Settings.
  await page.goto("/settings");
  await expect(page.getByLabel("Safe-to-spend buffer")).toHaveValue("5000.00");
});
