import { expect, test, type Page } from "@playwright/test";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { addPerson } from "./helpers/lists";
import { accountRow, addTransaction, fillTransaction, isoDay, pickPayee } from "./helpers/transactions";

/** R4 T032 — User Story 3: lend, borrow, repay and pay on someone's behalf (spec US3 1–4, 6; quickstart S3-a). */

const personRow = (page: Page, name: string) => page.locator(`[data-person-name='${name}']`);

async function memberWithRavi(page: Page, request: import("@playwright/test").APIRequestContext, prefix: string) {
  await newSignedInMember(page, request, prefix);
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "1,00,000.00", date: isoDay(-60) });
  await addAccount(page, { name: "Cash in hand", type: "Cash", balance: "10,000.00", date: isoDay(-60) });
  await addPerson(page, { name: "Ravi Kumar", amount: "15,000.00", direction: "They owe me", date: isoDay(-60) });
}

test("lent, received back and paid on his behalf move Ravi's balance and the accounts (US3 1–3, S3-a)", async ({ page, request }) => {
  test.slow(); // three accounts and people, three transactions, four screens
  await memberWithRavi(page, request, "txpeople");

  await addTransaction(page, { type: "Person", action: "Lent to", payee: ["Ravi", "Ravi Kumar"], account: "Cash in hand", amount: "5,000.00", date: isoDay(-10) });
  await addTransaction(page, { type: "Person", action: "Received back from", payee: ["Ravi", "Ravi Kumar"], account: "Everyday Savings", amount: "8,000.00", date: isoDay(-8) });
  await addTransaction(page, { type: "Person", action: "Paid on behalf of", payee: ["Ravi", "Ravi Kumar"], account: "Everyday Savings", amount: "2,500.00", date: isoDay(-5), notes: "Electricity bill" });

  await page.goto("/people");
  await expect(personRow(page, "Ravi Kumar")).toContainText("owes you ₹14,500.00");

  // His page lists the movements newest first with the balance after each.
  await personRow(page, "Ravi Kumar").getByRole("link", { name: "Ravi Kumar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ravi Kumar" })).toBeVisible({ timeout: 30_000 }); // first visit compiles in dev
  const movements = page.getByRole("list", { name: "Movements" }).getByRole("listitem");
  await expect(movements).toHaveCount(3);
  await expect(movements.nth(0)).toContainText("Paid on behalf of Ravi Kumar");
  await expect(movements.nth(0)).toContainText("after this: owes you ₹14,500.00");
  await expect(movements.nth(1)).toContainText("Received back from Ravi Kumar");
  await expect(movements.nth(1)).toContainText("after this: owes you ₹12,000.00");
  await expect(movements.nth(2)).toContainText("Lent to Ravi Kumar");
  await expect(movements.nth(2)).toContainText("after this: owes you ₹20,000.00");

  await page.goto("/accounts");
  await expect(accountRow(page, "Cash in hand")).toContainText("₹5,000.00");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹1,05,500.00");
});

test("being repaid more than he owes flips the balance, in words (US3 3)", async ({ page, request }) => {
  await memberWithRavi(page, request, "txflip");
  await addTransaction(page, { type: "Person", action: "Received back from", payee: ["Ravi", "Ravi Kumar"], account: "Everyday Savings", amount: "20,000.00", date: isoDay(-3) });
  await page.goto("/people");
  await expect(personRow(page, "Ravi Kumar")).toContainText("you owe ₹5,000.00");
});

test("an adjustment needs a reason and changes only the person's balance (US3 6)", async ({ page, request }) => {
  await memberWithRavi(page, request, "txadjust");
  await page.goto("/transactions/new");
  await page.getByRole("group", { name: "Type" }).getByText("Person", { exact: true }).click();
  await page.getByLabel("What happened").selectOption({ label: "Adjustment" });
  await pickPayee(page, "Person", "Ravi", "Ravi Kumar");
  await expect(page.getByLabel(/^(Paid from|Into account)$/)).toHaveCount(0); // no account
  await page.getByLabel("I owe them more").check();
  await fillTransaction(page, { amount: "1,000.00", date: isoDay(-2) });
  await expect(page.getByText("Give a reason for the adjustment.")).toBeVisible();

  await fillTransaction(page, { amount: "1,000.00", notes: "Forgave part of the loan" });
  await expect(page).toHaveURL(/\/transactions$/);
  await page.goto("/people");
  await expect(personRow(page, "Ravi Kumar")).toContainText("owes you ₹14,000.00");
  await page.goto("/accounts");
  await expect(accountRow(page, "Everyday Savings")).toContainText("₹1,00,000.00");
  await expect(accountRow(page, "Cash in hand")).toContainText("₹10,000.00");
});
