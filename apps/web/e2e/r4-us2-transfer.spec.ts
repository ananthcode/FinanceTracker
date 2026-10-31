import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { accountRow, addTransaction, fillTransaction, isoDay, transactionRows } from "./helpers/transactions";

/** R4 T029 — User Story 2: move money between my accounts (spec US2 1–3; quickstart S2-a; SC-001). */

test("paying the card from savings moves both balances and leaves net worth alone (US2 1–2, S2-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "txtransfer");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "1,00,000.00", date: isoDay(-60) });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18,250.00", date: isoDay(-60) });
  await expect(page.locator("#figure-net-worth")).toContainText("₹81,750.00");

  const started = Date.now();
  await addTransaction(page, { type: "Transfer", account: "Everyday Savings", toAccount: "Rewards Card", amount: "18,250.00", date: isoDay(-2) });
  expect(Date.now() - started).toBeLessThan(20_000); // SC-001

  const row = transactionRows(page).first();
  await expect(row).toContainText("Transferred from Everyday Savings to Rewards Card");
  // A transfer is neither income nor spending: the list's net total stays at zero.
  await expect(page.getByText("1 transaction")).toContainText("net ₹0.00");

  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹81,750.00");
  await expect(accountRow(page, "Rewards Card")).toContainText("₹0.00");
  await expect(page.locator("#figure-net-worth")).toContainText("₹81,750.00");
});

test("the same account as from and to is refused (US2 3)", async ({ page, request }) => {
  await newSignedInMember(page, request, "txsame");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "1,000.00", date: isoDay(-60) });
  await page.goto("/transactions/new");
  await fillTransaction(page, { type: "Transfer", toAccount: "Everyday Savings", amount: "100", date: isoDay(-1) });
  await expect(page.getByText("Choose two different accounts.")).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\/new$/);
});
