import { expect, test, type Page } from "@playwright/test";
import { admin, uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember } from "./helpers/users";

/** T034 — R2 User Story 1: add accounts with opening balances (quickstart S1-a…S1-c; SC-001). */

async function newSignedInMember(page: Page, request: Parameters<typeof createMember>[0], prefix: string): Promise<string> {
  await ensureOwner(request);
  const email = uniqueEmail(prefix);
  await createMember(request, email);
  await signInUI(page, email);
  return email;
}

async function addAccount(page: Page, a: { name: string; type: string; balance: string; date?: string }) {
  await page.goto("/accounts/new");
  await page.getByLabel("Name", { exact: true }).fill(a.name);
  await page.getByLabel("Type").selectOption({ label: a.type });
  await page.getByLabel(/^(Opening balance|Amount owed)/).fill(a.balance);
  if (a.date) await page.getByLabel("Balance on").fill(a.date);
  await page.getByRole("button", { name: "Add account" }).click();
}

async function accountCount(email: string): Promise<number> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const { count } = await db.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", profile!.user_id);
  return count ?? 0;
}

test("an empty Accounts screen explains accounts and offers Add account (S1-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "acc-empty");
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add account" }).first()).toBeVisible();
});

test("added accounts are listed by type with exact balances (S1-b, SC-001)", async ({ page, request }) => {
  await newSignedInMember(page, request, "acc-add");
  const started = Date.now();
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "52,340.50", date: "2026-04-01" });
  await expect(page).toHaveURL(/\/accounts$/);
  expect(Date.now() - started).toBeLessThan(60_000); // SC-001: first account in under a minute

  await addAccount(page, { name: "Cash in hand", type: "Cash", balance: "2000" });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18250" });
  await expect(page).toHaveURL(/\/accounts$/);

  const bank = page.getByRole("region", { name: "Bank accounts" });
  const cash = page.getByRole("region", { name: "Cash" });
  const cards = page.getByRole("region", { name: "Credit cards" });
  await expect(bank).toContainText("Everyday Savings");
  await expect(bank).toContainText("₹52,340.50");
  await expect(cash).toContainText("₹2,000.00");
  await expect(cards).toContainText("Rewards Card");
  await expect(cards).toContainText("₹18,250.00");
  await expect(cards).toContainText("owed"); // a label, never colour alone (FR-015)
});

test("bad input is refused with a message and nothing is saved (S1-c)", async ({ page, request }) => {
  const email = await newSignedInMember(page, request, "acc-bad");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "100" });
  await expect(page).toHaveURL(/\/accounts$/);

  await addAccount(page, { name: "everyday savings", type: "Bank account", balance: "100" });
  await expect(page.getByText("You already have an account with this name")).toBeVisible();

  await addAccount(page, { name: "Too precise", type: "Bank account", balance: "1,234.567" });
  await expect(page.getByText("Use at most two decimal places")).toBeVisible();

  await addAccount(page, { name: "From the future", type: "Bank account", balance: "100", date: "2099-01-01" });
  await expect(page.getByText("The date must be today or earlier")).toBeVisible();

  expect(await accountCount(email)).toBe(1);
});
