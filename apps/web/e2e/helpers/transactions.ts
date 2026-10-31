import { expect, type Locator, type Page } from "@playwright/test";
import { admin } from "./db";
import { pickCategory } from "./lists";

/** R4 e2e helpers: transactions through the real UI. Synthetic data only; dates relative to today. */

/** Today in the default timezone (Asia/Kolkata), `yyyy-MM-dd`, shifted by `days`. */
export function isoDay(days = 0): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The 1st of the month `months` away from this month (Asia/Kolkata), `yyyy-MM-dd`. */
export function isoMonth(months = 0): string {
  const d = new Date(`${isoDay(0).slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export type TransactionType ="Expense" | "Income" | "Refund" | "Transfer" | "Person";

export interface TransactionInput {
  type?: TransactionType;
  account?: string;
  toAccount?: string;
  amount: string;
  date?: string;
  /** Payee (or person) to choose: [what to type, the option to click]. */
  payee?: [string, string];
  /** Category to choose: [what to type, the option's full path]. */
  category?: [string, string];
  action?: string;
  notes?: string;
}

/** Chooses an option in a PayeeCombobox by typing part of its name. */
export async function pickPayee(scope: Page | Locator, label: string, query: string, option: string): Promise<void> {
  const box = scope.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(query);
  await scope.getByRole("option", { name: option, exact: true }).click();
}

/** Fills the add-transaction form (already open) and saves; does not wait for the result. */
export async function fillTransaction(page: Page, t: TransactionInput): Promise<void> {
  // The type choices are visually-hidden radios inside their labels: click the label.
  if (t.type) await page.getByRole("group", { name: "Type" }).getByText(t.type, { exact: true }).click();
  if (t.action) await page.getByLabel("What happened").selectOption({ label: t.action });
  if (t.payee) await pickPayee(page, t.type === "Person" ? "Person" : "Payee (optional)", t.payee[0], t.payee[1]);
  if (t.account) await page.getByLabel(/^(Paid from|Into account|From account)$/).selectOption({ label: t.account });
  if (t.toAccount) await page.getByLabel("To account").selectOption({ label: t.toAccount });
  await page.getByLabel("Amount", { exact: true }).fill(t.amount);
  if (t.date) await page.getByLabel("Date", { exact: true }).fill(t.date);
  if (t.category) await pickCategory(page, "Category", t.category[0], t.category[1]);
  if (t.notes !== undefined) await page.getByLabel(/^(Notes \(optional\)|Reason)$/).fill(t.notes);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

/** Adds a transaction from /transactions/new and waits for the list. */
export async function addTransaction(page: Page, t: TransactionInput): Promise<void> {
  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add transaction" })).toBeVisible();
  await fillTransaction(page, t);
  await expect(page).toHaveURL(/\/transactions$/);
}

/** An account's row on the Accounts screen (its name and balance). */
export function accountRow(page: Page, name: string): Locator {
  return page.locator("[data-account-row]").filter({ has: page.locator("[data-account-name]", { hasText: name }) });
}

/** The list rows (the main list, not "To confirm"). */
export function transactionRows(page: Page): Locator {
  return page.getByRole("list", { name: "Transactions", exact: true }).getByRole("listitem");
}

export async function setPayeeHidden(email: string, name: string): Promise<void> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const { error } = await db.from("payees").update({ hidden: true }).eq("user_id", profile!.user_id).eq("name", name);
  if (error) throw new Error(error.message);
}

export interface SeedTx {
  date: string;
  kind: "expense" | "income" | "refund";
  account: string;
  /** Paise. */
  amountMinor: string;
  /** The category's own name (unique in the demo lists). */
  category?: string;
  payee?: string;
  notes?: string;
}

/**
 * Inserts transactions straight into the LOCAL database for a user (names resolved to their ids).
 * Rows go through the normal triggers (stamp, postings, history).
 */
export async function seedTransactions(email: string, list: SeedTx[]): Promise<void> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const userId = profile!.user_id as string;
  const idOf = async (table: "accounts" | "categories" | "payees", name: string) => {
    const { data } = await db.from(table).select("id").eq("user_id", userId).eq("name", name).neq("state", "deleted").single();
    if (!data) throw new Error(`seedTransactions: no ${table} row named ${name}`);
    return data.id as string;
  };
  const rows = [];
  for (const t of list) {
    rows.push({
      id: crypto.randomUUID(), user_id: userId, date: t.date, kind: t.kind, flow: t.kind === "expense" ? "out" : "in",
      account_id: await idOf("accounts", t.account), amount_minor: t.amountMinor,
      category_id: t.category ? await idOf("categories", t.category) : null,
      payee_id: t.payee ? await idOf("payees", t.payee) : null, notes: t.notes ?? null, server_seq: 0,
    });
  }
  const { error } = await db.from("transactions").insert(rows);
  if (error) throw new Error(`seedTransactions: ${error.message}`);
}

/** Adds a business payee straight into the LOCAL database. */
export async function seedBusiness(email: string, name: string): Promise<void> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const { error } = await db.from("payees").insert({ id: crypto.randomUUID(), user_id: profile!.user_id, name, kind: "business", server_seq: 0 });
  if (error) throw new Error(error.message);
}

/** Moves a transaction's date (the local stack only): simulates the day it was planned for arriving. */
export async function backdateTransaction(email: string, notes: string, date: string): Promise<void> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const { error } = await db.from("transactions").update({ date }).eq("user_id", profile!.user_id).eq("notes", notes);
  if (error) throw new Error(error.message);
}
