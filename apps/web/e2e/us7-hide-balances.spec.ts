import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists, uniqueEmail } from "./helpers/db";
import { addPerson } from "./helpers/lists";
import { ensureOwner, signInUI } from "./helpers/owner";
import { seedDemoTransactions } from "./helpers/transactions";
import { createMember } from "./helpers/users";

/** T115 — User Story 7 on web: hide-balances (quickstart S7-a; FR-031–FR-033, SC-006). */
test("the toggle masks every amount, persists on reload, and leaves other browsers alone (S7-a)", async ({
  page,
  request,
  browser,
}) => {
  await ensureOwner(request);
  const member = uniqueEmail("hide");
  await createMember(request, member);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInUI(page, member);
  await page.goto("/settings");

  const preview = page.locator("#format-preview");
  await expect(preview).toContainText(/₹[\d,]+\.\d{2}/);

  const toggle = page.getByRole("switch", { name: "Hide balances" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(preview).toContainText("₹••••");
  // SC-006: no unmasked amount left anywhere on the screen.
  expect(await page.locator("main").innerText()).not.toMatch(/₹\s?[\d,]+\.\d{2}/);

  await page.reload();
  await expect(page.getByRole("switch", { name: "Hide balances" })).toHaveAttribute("aria-checked", "true");
  await expect(preview).toContainText("₹••••");

  // FR-033: another browser (device) of the same user is unaffected.
  const other = await (await browser.newContext()).newPage();
  await other.setViewportSize({ width: 1280, height: 800 });
  await signInUI(other, member);
  await other.goto("/settings");
  await expect(other.locator("#format-preview")).toContainText(/₹[\d,]+\.\d{2}/);

  // Switching off restores amounts at once, without a reload.
  await page.getByRole("switch", { name: "Hide balances" }).click();
  await expect(preview).toContainText(/₹[\d,]+\.\d{2}/);
});

/**
 * SC-006 review list: every screen that shows amounts, checked with hide-balances on. Each module
 * adds its screens here (R2: /accounts).
 */
const SCREENS_WITH_AMOUNTS = ["/settings", "/accounts", "/people", "/settings/payees"]; // R3 adds people and payees

test("every screen in the review list is masked (SC-006)", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newSignedInMember(page, request, "hidelist");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "52,340.50" });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18250", creditLimit: "50000" });
  await addPerson(page, { name: "Ravi Kumar", amount: "15,000.00", direction: "They owe me", includeInNetWorth: true });
  await page.getByRole("switch", { name: "Hide balances" }).click();

  for (const path of SCREENS_WITH_AMOUNTS) {
    await page.goto(path);
    await expect(page.locator("main")).toContainText("₹••••");
    expect(await page.locator("main").innerText(), path).not.toMatch(/₹\s?[\d,]+\.\d{2}/);
  }
});

test("the transaction screens are masked too (R4 SC-006, FR-024)", async ({ page, request }) => {
  test.slow();
  await page.setViewportSize({ width: 1280, height: 800 });
  const email = await newSignedInMember(page, request, "hidetx");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Hide balances" }).click();

  // The list (with To confirm), an account's and a person's transactions. (Forms show the amount
  // being edited in its field: you see what you change.)
  await page.goto("/accounts");
  const account = await page.locator("[data-account-row]").getByRole("link", { name: "Everyday Savings" }).getAttribute("href");
  await page.goto("/people");
  const person = await page.locator("[data-person-name='Ravi Kumar']").getByRole("link").getAttribute("href");
  for (const path of ["/transactions", account!, person!]) {
    await page.goto(path);
    await expect(page.locator("main")).toContainText("₹••••");
    // "₹0.00" in a rule ("the balance must be ₹0.00") is not one of the user's amounts.
    expect((await page.locator("main").innerText()).replaceAll("₹0.00", ""), path).not.toMatch(/₹\s?[\d,]+\.\d{2}/);
  }
});

test("on narrow screens the toggle is in the top bar", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("hidenarrow");
  await createMember(request, member);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInUI(page, member);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Hide balances" }).click();
  await expect(page.locator("#format-preview")).toContainText("₹••••");
});
