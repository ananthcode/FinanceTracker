import { expect, test, type Page } from "@playwright/test";
import { addAccount, newSignedInMember, submitAccount } from "./helpers/accounts";
import { admin } from "./helpers/db";

/** T053 — R2 User Story 4: archive, restore and delete (quickstart S4-a, S4-b; FR-021–FR-024). */

async function openEdit(page: Page, name: string) {
  await page.goto("/accounts");
  const archived = page.locator("#archived");
  if (await archived.count()) await archived.evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit account" })).toBeVisible();
}

async function stateOf(email: string, name: string): Promise<string | undefined> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const { data } = await db.from("accounts").select("state").eq("user_id", profile!.user_id).eq("name", name).maybeSingle();
  return data?.state as string | undefined;
}

test("archive at ₹0.00, refuse with a balance, restore in place (S4-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "archive");
  await addAccount(page, { name: "Old Wallet", type: "Wallet", balance: "0" });
  await addAccount(page, { name: "Main Savings", type: "Bank account", balance: "1000" });
  const owned = await page.locator("#figure-owned dd").innerText();

  await openEdit(page, "Main Savings");
  await expect(page.getByRole("button", { name: "Archive account" })).toBeDisabled();
  await expect(page.locator("#archive-help")).toContainText("₹1,000.00");
  await expect(page.locator("#archive-help")).toContainText("must be ₹0.00");

  await openEdit(page, "Old Wallet");
  await page.getByRole("button", { name: "Archive account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("region", { name: "Wallets" })).toHaveCount(0);
  await expect(page.locator("#figure-owned dd")).toHaveText(owned); // archiving never changes totals
  await page.getByText("Archived accounts (1)").click();
  await expect(page.locator("#archived")).toContainText("Old Wallet");

  await page.getByRole("button", { name: "Restore Old Wallet" }).click();
  await expect(page.getByRole("region", { name: "Wallets" })).toContainText("Old Wallet");
  await expect(page.locator("#archived")).toHaveCount(0);
});

test("delete removes a never-used account everywhere; an archived name is suggested for restore (S4-b)", async ({
  page,
  request,
}) => {
  const email = await newSignedInMember(page, request, "delete");
  await addAccount(page, { name: "Main Savings", type: "Bank account", balance: "1000" });
  await addAccount(page, { name: "Test account", type: "Cash", balance: "50" });

  await openEdit(page, "Test account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.locator("main")).not.toContainText("Test account");
  expect(await stateOf(email, "Test account")).toBe("deleted");

  await addAccount(page, { name: "Old Wallet", type: "Wallet", balance: "0" });
  await openEdit(page, "Old Wallet");
  await page.getByRole("button", { name: "Archive account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await submitAccount(page, { name: "old wallet", type: "Wallet", balance: "0" });
  await expect(page.getByText("An archived account has this name")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the archived account" })).toBeVisible();
});

test("archiving the last active account shows the empty state with a link to archived accounts", async ({ page, request }) => {
  await newSignedInMember(page, request, "lastone");
  await addAccount(page, { name: "Only Wallet", type: "Wallet", balance: "0" });
  await openEdit(page, "Only Wallet");
  await page.getByRole("button", { name: "Archive account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await page.getByRole("link", { name: "See archived accounts" }).click();
  await expect(page.locator("#archived")).toContainText("Only Wallet");
});
