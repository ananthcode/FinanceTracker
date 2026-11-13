import { addMonths, monthName, monthOf, todayInZone } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";

/**
 * R7 T018 — User Story 1: this month's plan on one screen (spec US1 1–4; quickstart S1-a, S1-b; SC-001).
 * The demo household is built for the server's today, so expectations are relative to today.
 */

/** "₹1,83,765.50" → 18376550 (paise). */
const paise = (text: string) => BigInt(text.replace(/[^\d]/g, ""));
const thisMonth = monthOf(todayInZone("Asia/Kolkata"));
const STATUS = /^(Paid|Part paid|Due|Due today|Skipped|Overdue(, part paid)? · \d+ days? late)$/;

test("with no plan items the screen explains the plan and offers to add one (US1 4)", async ({ page, request }) => {
  await newSignedInMember(page, request, "planempty");
  await page.goto("/payment-plan");
  await expect(page.getByRole("heading", { level: 1, name: "Payment plan" })).toBeVisible();
  await expect(page.getByText("Coming soon")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add a planned payment" })).toBeVisible();
  if (process.env.NEXT_PUBLIC_APP_ENV === "demo") await expect(page.getByRole("link", { name: "Load demo data" })).toBeVisible();
});

test("the demo household's month: items by due date, statuses in words, exact totals, months to step through (US1 1–3, S1-a, S1-b)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planmonth");
  await loadDemoFromSettings(page);
  await page.goto("/payment-plan");
  await expect(page.locator("#plan-month")).toHaveText(monthName(thisMonth));

  // US1 1: by due date, every status in words.
  const rows = page.locator("tbody").first().locator("[data-plan-row]");
  await expect(rows.first()).toBeVisible();
  const dues = await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-due") ?? ""));
  expect(dues).toEqual([...dues].sort());
  for (const text of await page.locator("[data-plan-status]").allInnerTexts()) expect(text.trim()).toMatch(STATUS);
  await expect(rows.filter({ has: page.locator("th", { hasText: "Rent" }) }).first()).toBeVisible();

  // US1 2: planned = paid + still to pay, exactly (the demo pays nothing over its plan).
  const planned = paise(await page.locator("#plan-total-planned").innerText());
  const paid = paise(await page.locator("#plan-total-paid").innerText());
  const left = paise(await page.locator("#plan-total-left").innerText());
  expect(planned).toBe(paid + left);

  // Last month's electricity is carried over as Overdue, with its own month.
  const carried = page.locator("#plan-carried");
  await expect(carried.locator("[data-name='Electricity']")).toHaveAttribute("data-status", "overdue");
  await expect(carried).toContainText(`For ${monthName(addMonths(thisMonth, -1))}`);

  // US1 3 / S1-b: last month shows what was paid; next month what is planned.
  await page.getByRole("link", { name: `Previous month, ${monthName(addMonths(thisMonth, -1))}` }).click();
  await expect(page.locator("#plan-month")).toHaveText(monthName(addMonths(thisMonth, -1)));
  await expect(page).toHaveURL(new RegExp(`month=${addMonths(thisMonth, -1).slice(0, 7)}`));
  await expect(page.locator("tbody").first().locator("[data-name='Rent']")).toHaveAttribute("data-status", "paid");
  await expect(page.locator("tbody").first().locator("[data-name='Electricity']")).toHaveAttribute("data-status", "overdue");
  await expect(page.locator("#plan-cash")).toHaveCount(0); // cash by account is for the current month

  await page.goto(`/payment-plan?month=${addMonths(thisMonth, 1).slice(0, 7)}`);
  await expect(page.locator("#plan-month")).toHaveText(monthName(addMonths(thisMonth, 1)));
  const next = page.locator("tbody").first();
  await expect(next.locator("[data-name='Rent']")).toContainText("Upcoming payment linked");
  await expect(next.locator("[data-name='Stream Plus']")).toHaveAttribute("data-status", "skipped");
  await expect(next.locator("[data-name='Electricity']")).toContainText("estimated");
  await expect(page.locator("#plan-carried")).toContainText(`Counted in ${monthName(thisMonth)}`);
});

test("months run from the earliest item to 24 months ahead (FR-004)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planrange");
  await loadDemoFromSettings(page);
  await page.goto("/payment-plan?month=2019-01");
  await expect(page.locator("#plan-month")).toHaveText("April 2025");
  await expect(page.getByLabel("No earlier month")).toBeVisible();
  const last = addMonths(thisMonth, 24);
  await page.goto(`/payment-plan?month=${last.slice(0, 7)}`);
  await expect(page.locator("#plan-month")).toHaveText(monthName(last));
  await expect(page.getByLabel("No later month")).toBeVisible();
});
