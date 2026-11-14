import type { Locator, Page } from "@playwright/test";
import { addMonths, monthOf, todayInZone, type Month } from "@ft/core";
import { expect } from "../fixtures";

/** R7 e2e helpers: the payment plan through the real UI. Synthetic data only. */

export const thisMonth: Month = monthOf(todayInZone("Asia/Kolkata"));
export const monthParam = (m: Month) => m.slice(0, 7);
export const monthAfter = (n: number): Month => addMonths(thisMonth, n);

/** "₹1,83,765.50" → 18376550 (paise). */
export const paise = (text: string) => BigInt(text.replace(/[^\d]/g, ""));

export async function openPlan(page: Page, month: Month = thisMonth): Promise<void> {
  await page.goto(`/payment-plan?month=${monthParam(month)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Payment plan" })).toBeVisible();
}

/** A row of the month's own table (not the carried-over one). */
export function planRow(page: Page, name: string): Locator {
  return page.locator("table").first().locator(`[data-plan-row][data-name='${name}']`);
}

export interface ItemInput {
  name: string;
  payee?: string;
  amount?: string;
  varies?: boolean;
  dueDay?: number;
  from?: string;
  frequency?: "Every month" | "Every few months" | "Every year" | "Once (this month only)";
  everyN?: number;
  /** `yyyy-MM` */
  start?: string;
}

/** Adds a planned payment to a payee from the month being viewed and waits for the plan to show again. */
export async function addPlanItem(page: Page, month: Month, item: ItemInput): Promise<void> {
  await page.goto(`/payment-plan/new?month=${monthParam(month)}`);
  await page.getByLabel("Name", { exact: true }).fill(item.name);
  await page.getByLabel("Paid to").selectOption({ label: item.payee ?? "Fresh Mart" });
  if (item.amount) await page.getByLabel("Amount", { exact: true }).fill(item.amount);
  if (item.varies) await page.getByLabel("Amount varies").check();
  await page.getByLabel("Due day").fill(String(item.dueDay ?? 5));
  await page.getByLabel("Paid from").selectOption({ label: item.from ?? "Everyday Savings" });
  if (item.frequency) await page.getByLabel("How often").selectOption({ label: item.frequency });
  if (item.everyN) await page.getByLabel("Every how many months").fill(String(item.everyN));
  if (item.start) await page.getByLabel(/^(First month|Month)$/).fill(item.start);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/payment-plan\?month=/);
}

/**
 * Seeds `count` monthly plan items for a user who has the demo accounts and lists (seedAccounts /
 * seedLists with demo), each started `months` months ago and paid every month through a linked
 * transaction — straight into the LOCAL database (R7 T038, SC-003 volume).
 */
export async function seedManyPlanItems(email: string, count: number, months: number): Promise<void> {
  const { admin } = await import("./db");
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const userId = profile!.user_id as string;
  const one = async (table: string, name: string) => {
    const { data, error } = await db.from(table).select("id").eq("user_id", userId).eq("name", name).single();
    if (error) throw new Error(`seedManyPlanItems: ${table} ${name}: ${error.message}`);
    return data!.id as string;
  };
  const [account, payee] = await Promise.all([one("accounts", "Everyday Savings"), one("payees", "Fresh Mart")]);
  const start = monthAfter(-months);
  const items = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    name: `Planned payment ${i + 1}`,
    target: "payee",
    payee_id: payee,
    frequency: "monthly",
    interval_months: 1,
    start_month: start,
    terms: [{ fromMonth: start, amountMinor: String(10_000 + i * 100), dueDay: 1 + (i % 28), accountId: account }],
    server_seq: 0,
  }));
  const { error } = await db.from("plan_items").insert(items);
  if (error) throw new Error(`seedManyPlanItems items: ${error.message}`);
  const links: Record<string, unknown>[] = [];
  for (const item of items) {
    for (let m = 0; m < months; m++) {
      const month = monthAfter(m - months);
      links.push({
        id: crypto.randomUUID(), user_id: userId, date: `${month.slice(0, 8)}05`, kind: "expense", flow: "out", account_id: account,
        amount_minor: item.terms[0]!.amountMinor, payee_id: payee, status: "cleared", confirmed: true, state: "active",
        plan_item_id: item.id, plan_month: month, server_seq: 0,
      });
    }
  }
  for (let i = 0; i < links.length; i += 1000) {
    const { error: e } = await db.from("transactions").insert(links.slice(i, i + 1000));
    if (e) throw new Error(`seedManyPlanItems links: ${e.message}`);
  }
}
