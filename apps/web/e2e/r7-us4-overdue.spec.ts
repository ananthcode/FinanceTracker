import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { addPlanItem, monthAfter, openPlan, paise, planRow, thisMonth } from "./helpers/plan";

/** R7 T028 — User Story 4: overdue carry-forward, counted once, and cash by account (spec US4 1–4; S4-a; SC-005). */

test("an unpaid month is carried over as Overdue, counted once, until it is paid (US4 1, 2, 4, SC-005)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planoverdue");
  await loadDemoFromSettings(page);
  const last = monthAfter(-1);

  // This month: last month's electricity is listed once, Overdue with days late and its own month, and is in the totals.
  await openPlan(page);
  const carried = page.locator("#plan-carried [data-plan-row]");
  await expect(carried).toHaveCount(1);
  await expect(carried.first()).toHaveAttribute("data-name", "Electricity");
  await expect(carried.first()).toHaveAttribute("data-month", last);
  await expect(carried.first().locator("[data-plan-status]")).toHaveText(/^Overdue · \d+ days? late$/);
  await expect(carried.first()).toContainText(`For ${monthName(last)}`);
  await expect(page.getByText("Includes 1 payment carried over from earlier months.")).toBeVisible();
  const withCarried = paise(await page.locator("#plan-total-left").innerText());

  // Next month: still listed, but counted in this month — not again there.
  await openPlan(page, monthAfter(1));
  await expect(page.locator("#plan-carried [data-plan-row]")).toHaveCount(1);
  await expect(page.locator("#plan-carried")).toContainText(`Counted in ${monthName(thisMonth)}`);
  await expect(page.getByText(/carried over from earlier months\.$/)).toHaveCount(0);

  // Its own month shows it Overdue too (the same item-month, not another one).
  await openPlan(page, last);
  await expect(planRow(page, "Electricity")).toHaveAttribute("data-status", "overdue");

  // US4 4: paying it clears it from every month's still to pay.
  await openPlan(page);
  const due = paise(await carried.first().locator("td").nth(2).innerText());
  await carried.first().getByRole("link", { name: /^Pay/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/payment-plan\?month=/);
  await expect(page.locator("#plan-carried")).toHaveCount(0);
  expect(withCarried - paise(await page.locator("#plan-total-left").innerText())).toBe(due);
  await openPlan(page, monthAfter(1));
  await expect(page.locator("#plan-carried")).toHaveCount(0);
  await openPlan(page, last);
  await expect(planRow(page, "Electricity")).toHaveAttribute("data-status", "paid");
});

test("cash by account: still to pay, what is available, and short by (US4 3, S4-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "plancash");
  await loadDemoFromSettings(page);
  // Cash in hand holds far less than this one-off payment.
  await addPlanItem(page, thisMonth, { name: "New fridge", payee: "Fresh Mart", amount: "5,00,000.00", from: "Cash in hand", frequency: "Once (this month only)", dueDay: 28 });

  await openPlan(page);
  const cash = page.locator("#plan-cash");
  const inHand = cash.locator("[data-cash-account='Cash in hand']");
  await expect(inHand).toContainText("Still to pay ₹5,00,000.00");
  await expect(inHand).toContainText("available");
  await expect(inHand).toContainText("short by");
  // short by = still to pay − available, exactly.
  const amounts = (await inHand.innerText()).match(/₹[\d,]+\.\d{2}/g)!.map(paise);
  expect(amounts).toHaveLength(3);
  expect(amounts[0]! - amounts[1]!).toBe(amounts[2]!);
  await expect(cash.locator("[data-cash-account='Everyday Savings']")).toContainText("Still to pay");

  // Only the current month shows it.
  await openPlan(page, monthAfter(1));
  await expect(page.locator("#plan-cash")).toHaveCount(0);
});
