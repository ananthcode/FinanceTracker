import { expect, type Locator, type Page } from "@playwright/test";
import { categoryPath, demoAccounts, demoLists, demoTransactions, indexCategories } from "@ft/core";
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

/**
 * Seeds the demo transactions and interest rates (packages/core demoTransactions, R4 T057) for a user
 * who already has the demo accounts and lists (seedAccounts / seedLists with demo). Demo ids are
 * mapped to the user's own rows by account and payee name, category path and tag name.
 */
export async function seedDemoTransactions(email: string, todayIso = isoDay(0)): Promise<void> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const userId = profile!.user_id as string;
  const rows = async (table: string, columns: string) => {
    const { data, error } = await db.from(table).select(columns).eq("user_id", userId).neq("state", "deleted");
    if (error) throw new Error(error.message);
    return data as unknown as Record<string, string | null>[];
  };
  const [accounts, categories, payees, tags] = await Promise.all([
    rows("accounts", "id, name"),
    rows("categories", "id, name, parent_id"),
    rows("payees", "id, name"),
    rows("tags", "id, name"),
  ]);
  const byName = (list: Record<string, string | null>[]) => new Map(list.map((r) => [r.name!, r.id!]));
  const userCategoryPath = new Map(categories.map((c) => [c.id!, c]));
  const pathOf = (id: string) => {
    const names: string[] = [];
    for (let c = userCategoryPath.get(id); c; c = c.parent_id ? userCategoryPath.get(c.parent_id) : undefined) names.unshift(c.name!);
    return names.join(" › ");
  };
  const userByPath = new Map(categories.map((c) => [pathOf(c.id!), c.id!]));

  const demo = demoLists();
  const demoIndex = indexCategories(demo.categories);
  const map = new Map<string, string>();
  for (const a of demoAccounts().accounts) map.set(a.id, byName(accounts).get(a.name)!);
  for (const c of demo.categories) map.set(c.id, userByPath.get(categoryPath(c.id, demoIndex))!);
  for (const p of demo.payees) map.set(p.id, byName(payees).get(p.name)!);
  for (const t of demo.tags) map.set(t.id, byName(tags).get(t.name)!);
  const to = (id: string | null) => (id ? (map.get(id) ?? null) : null);

  const { transactions, rates } = demoTransactions(todayIso);
  const insert = transactions.map((t) => ({
    id: crypto.randomUUID(), user_id: userId, date: t.date, time_of_day: null, kind: t.kind, flow: t.flow,
    account_id: to(t.accountId), to_account_id: to(t.toAccountId), amount_minor: t.amountMinor.toString(),
    payee_id: to(t.payeeId), person_action: t.personAction, category_id: to(t.categoryId),
    lines: t.lines.map((l) => ({
      id: crypto.randomUUID(), amountMinor: l.amountMinor.toString(), categoryId: to(l.categoryId), personId: to(l.personId),
      personAction: l.personAction, notes: l.notes, tagIds: l.tagIds.map((x) => to(x)),
    })),
    tag_ids: t.tagIds.map((x) => to(x)), notes: t.notes, reference: t.reference, status: t.status, confirmed: t.confirmed,
    generated: false, interest_month: null, user_edited: false, state: t.state, server_seq: 0,
  }));
  for (let i = 0; i < insert.length; i += 500) {
    const { error } = await db.from("transactions").insert(insert.slice(i, i + 500));
    if (error) throw new Error(`seedDemoTransactions: ${error.message}`);
  }
  const { error } = await db.from("person_rates").insert(
    rates.map((r) => ({ id: crypto.randomUUID(), user_id: userId, payee_id: to(r.payeeId), effective_month: r.effectiveMonth, rate_e4: r.rateE4, server_seq: 0 })),
  );
  if (error) throw new Error(`seedDemoTransactions rates: ${error.message}`);
}

/**
 * Seeds `count` generated expenses and incomes over the last two years for a user with the demo
 * accounts and lists (performance tests, SC-003). Spread over accounts, categories and payees.
 */
export async function seedManyTransactions(email: string, count: number): Promise<void> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const userId = profile!.user_id as string;
  const live = async (table: "accounts" | "categories" | "payees", columns: string) => {
    const { data, error } = await db.from(table).select(columns).eq("user_id", userId).eq("state", "active");
    if (error) throw new Error(error.message);
    return data as unknown as { id: string; kind?: string }[];
  };
  const accounts = (await live("accounts", "id")).map((a) => a.id);
  const categories = await live("categories", "id, kind");
  const expense = categories.filter((c) => c.kind === "expense").map((c) => c.id);
  const income = categories.filter((c) => c.kind === "income").map((c) => c.id);
  const payees = (await live("payees", "id, kind")).filter((p) => p.kind === "business").map((p) => p.id);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const isIncome = i % 10 === 0;
    rows.push({
      id: crypto.randomUUID(), user_id: userId, date: isoDay(-(i % 700) - 1), time_of_day: null,
      kind: isIncome ? "income" : "expense", flow: isIncome ? "in" : "out",
      account_id: accounts[i % accounts.length], to_account_id: null, amount_minor: String(1000 + ((i * 7919) % 500000)),
      payee_id: payees[i % payees.length], person_action: null,
      category_id: isIncome ? income[i % income.length] : expense[i % expense.length],
      lines: [], tag_ids: [], notes: i % 50 === 0 ? `Seeded note ${i}` : null, reference: null, status: "cleared",
      confirmed: true, generated: false, interest_month: null, user_edited: false, state: "active", server_seq: 0,
    });
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("transactions").insert(rows.slice(i, i + 1000));
    if (error) throw new Error(`seedManyTransactions: ${error.message}`);
  }
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
