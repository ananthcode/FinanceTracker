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
