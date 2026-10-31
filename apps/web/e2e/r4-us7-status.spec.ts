import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { accountRow, addTransaction, isoDay, transactionRows } from "./helpers/transactions";

/**
 * R4 T050 — User Story 7: statuses and corrections (spec US7 1–2; quickstart S7-a). The history of
 * each edit (who, when, device, before/after) is checked by supabase/tests/tx_audit.test.sql.
 */

/** The list row whose notes are `notes` (every row here is labelled "Spent"). */
const row = (page: Page, notes: string) => transactionRows(page).filter({ hasText: notes });

/** Opens a transaction by its notes, changes it and saves (retrying until the page is interactive). */
async function editByNotes(page: Page, notes: string, change: () => Promise<void>) {
  await page.goto("/transactions");
  await row(page, notes).getByRole("link", { name: "Spent" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit transaction" })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await change();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions$/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

test("Cleared and Follow-up are shown; Void stays listed, struck through, and counts nowhere; edits count at once (US7 1–2, S7-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "txstatus");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "10,000.00", date: isoDay(-60) });
  await addTransaction(page, { amount: "100.00", date: isoDay(-3), notes: "Milk" });
  await addTransaction(page, { amount: "200.00", date: isoDay(-2), notes: "Bread" });
  await addTransaction(page, { amount: "300.00", date: isoDay(-1), notes: "Mistake" });
  const status = (label: string) => () => page.getByLabel("Status").selectOption({ label }).then(() => undefined);

  await editByNotes(page, "Milk", status("Cleared"));
  await expect(row(page, "Milk")).toContainText("Cleared");
  await editByNotes(page, "Bread", status("Follow-up"));
  await expect(row(page, "Bread")).toContainText("Follow-up");
  await editByNotes(page, "Mistake", status("Void"));
  await expect(row(page, "Mistake")).toContainText("Void");
  await expect(row(page, "Mistake").getByRole("link", { name: "Spent" })).toHaveClass(/line-through/);

  // 10,000 − 100 − 200: the void 300 counts nowhere.
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹9,700.00");

  // An edit counts at once.
  await editByNotes(page, "Milk", () => page.getByLabel("Amount", { exact: true }).fill("150.00"));
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹9,650.00");
});
