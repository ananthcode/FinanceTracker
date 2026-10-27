import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { uniqueEmail } from "./db";
import { ensureOwner, signInUI } from "./owner";
import { createMember } from "./users";

/** R2 e2e helpers: synthetic members and accounts created through the real UI. */

export async function newSignedInMember(page: Page, request: APIRequestContext, prefix: string): Promise<string> {
  await ensureOwner(request);
  const email = uniqueEmail(prefix);
  await createMember(request, email);
  await signInUI(page, email);
  return email;
}

export interface AccountInput {
  name: string;
  type: "Bank account" | "Cash" | "Wallet" | "Credit card";
  balance: string;
  date?: string;
  creditLimit?: string;
  includeInNetWorth?: boolean;
}

/** Fills the add-account form and submits it (does not wait for the result). */
export async function submitAccount(page: Page, a: AccountInput): Promise<void> {
  await page.goto("/accounts/new");
  await page.getByLabel("Name", { exact: true }).fill(a.name);
  await page.getByLabel("Type").selectOption({ label: a.type });
  await page.getByLabel(/^(Opening balance|Amount owed)/).fill(a.balance);
  if (a.date) await page.getByLabel("Balance on").fill(a.date);
  if (a.creditLimit) await page.getByLabel("Credit limit (optional)").fill(a.creditLimit);
  if (a.includeInNetWorth === false) await page.getByLabel("Include in net worth").uncheck();
  await page.getByRole("button", { name: "Add account" }).click();
}

/** Adds an account and waits until the accounts list is shown again. */
export async function addAccount(page: Page, a: AccountInput): Promise<void> {
  await submitAccount(page, a);
  await expect(page).toHaveURL(/\/accounts$/);
}
