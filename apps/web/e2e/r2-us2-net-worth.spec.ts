import { expect, test } from "@playwright/test";
import { addAccount, newSignedInMember } from "./helpers/accounts";

/** T040 — R2 User Story 2: balances and net worth at a glance (quickstart S2-a…S2-c; SC-002, SC-006). */
const AMOUNT = /₹\s?[\d,]+\.\d{2}/;

test("summary shows Owned, Owed and Net worth with matching group subtotals (S2-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "nw-sum");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "52,340.50" });
  await addAccount(page, { name: "Cash in hand", type: "Cash", balance: "2000" });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18250" });

  await expect(page.locator("#figure-owned")).toContainText("₹54,340.50");
  await expect(page.locator("#figure-owed")).toContainText("₹18,250.00");
  await expect(page.locator("#figure-net-worth")).toContainText("₹36,090.50");

  await expect(page.getByRole("region", { name: "Bank accounts" }).locator("[data-subtotal]")).toContainText("₹52,340.50");
  await expect(page.getByRole("region", { name: "Cash" }).locator("[data-subtotal]")).toContainText("₹2,000.00");
  await expect(page.getByRole("region", { name: "Credit cards" }).locator("[data-subtotal]")).toContainText("₹18,250.00 owed");
});

test("overdrawn and excluded accounts are labelled; a negative net worth has a sign and a label (S2-b)", async ({
  page,
  request,
}) => {
  await newSignedInMember(page, request, "nw-neg");
  await addAccount(page, { name: "Overdrawn Current", type: "Bank account", balance: "-500" });
  await addAccount(page, { name: "Family cash", type: "Cash", balance: "2000", includeInNetWorth: false });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18250" });

  const bank = page.getByRole("region", { name: "Bank accounts" });
  await expect(bank).toContainText("-₹500.00");
  await expect(bank).toContainText("overdrawn");
  const cash = page.getByRole("region", { name: "Cash" });
  await expect(cash).toContainText("excluded from net worth");
  await expect(cash.locator("[data-subtotal]")).toContainText("₹0.00"); // excluded from the subtotal

  await expect(page.locator("#figure-owned")).toContainText("-₹500.00");
  await expect(page.locator("#figure-owed")).toContainText("₹18,250.00");
  await expect(page.locator("#figure-net-worth")).toContainText("-₹18,750.00");
  await expect(page.locator("#figure-net-worth")).toContainText("more owed than owned");
});

test("hide balances masks every amount on Accounts (S2-c, SC-006)", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newSignedInMember(page, request, "nw-hide");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "52,340.50" });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18250", creditLimit: "50000" });
  await expect(page.locator("main")).toContainText(AMOUNT);

  await page.getByRole("switch", { name: "Hide balances" }).click();
  await expect(page.locator("#figure-net-worth")).toContainText("₹••••");
  expect(await page.locator("main").innerText()).not.toMatch(AMOUNT);
});
