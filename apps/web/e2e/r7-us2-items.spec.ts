import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { addPlanItem, monthAfter, monthParam, openPlan, planRow, thisMonth } from "./helpers/plan";

/** R7 T021 — User Story 2: set up planned payments (spec US2 1–7; quickstart S2-a – S2-c; FR-005 – FR-008). */

test("items appear in exactly their months: monthly, every 3 months, yearly and one-off (US2 1, 3, 6, S2-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planitems");
  await loadDemoFromSettings(page);

  await addPlanItem(page, thisMonth, { name: "Gym membership", payee: "Fresh Mart", amount: "1,500.00", dueDay: 31 });
  await addPlanItem(page, thisMonth, { name: "Water tanker", payee: "Fresh Mart", amount: "900.00", frequency: "Every few months", everyN: 3 });
  await addPlanItem(page, thisMonth, { name: "Club fee", payee: "Fresh Mart", amount: "12,000.00", frequency: "Every year" });
  await addPlanItem(page, thisMonth, { name: "Wedding gift", payee: "Fresh Mart", amount: "5,000.00", frequency: "Once (this month only)" });

  // This month: all four, with the amounts entered.
  await openPlan(page);
  for (const name of ["Gym membership", "Water tanker", "Club fee", "Wedding gift"]) await expect(planRow(page, name)).toBeVisible();
  await expect(planRow(page, "Gym membership")).toContainText("₹1,500.00");
  // US2 6: a due day the month does not have is its last day.
  const lastDay = new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0)).getUTCDate();
  await expect(planRow(page, "Gym membership")).toHaveAttribute("data-due", `${thisMonth.slice(0, 8)}${String(lastDay).padStart(2, "0")}`);

  // Next month: only the monthly one.
  await openPlan(page, monthAfter(1));
  await expect(planRow(page, "Gym membership")).toBeVisible();
  for (const name of ["Water tanker", "Club fee", "Wedding gift"]) await expect(planRow(page, name)).toHaveCount(0);

  // Three months on: the every-3-months one again; twelve months on: the yearly one.
  await openPlan(page, monthAfter(3));
  await expect(planRow(page, "Water tanker")).toBeVisible();
  await expect(planRow(page, "Club fee")).toHaveCount(0);
  await openPlan(page, monthAfter(12));
  await expect(planRow(page, "Club fee")).toBeVisible();
  await expect(planRow(page, "Wedding gift")).toHaveCount(0);
});

test("a month's amount, estimates, edits from a month, skip, end and delete (US2 2, 4, 5, 7, S2-b, S2-c)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "planedit");
  await loadDemoFromSettings(page);
  const next = monthAfter(1);

  // US2 7 / S2-b: an amount that varies is estimated until the month's amount is set; only that month changes.
  await openPlan(page, next);
  const power = planRow(page, "Electricity");
  await expect(power).toContainText("estimated");
  await power.getByRole("button", { name: /Set amount/ }).click();
  await power.getByLabel(`Amount for ${monthName(next)}`).fill("2,150.00");
  await power.getByRole("button", { name: "Save amount" }).click();
  await expect(power).toContainText("₹2,150.00");
  await expect(power).not.toContainText("estimated");
  await openPlan(page, monthAfter(2));
  await expect(planRow(page, "Electricity")).toContainText("estimated");

  // US2 4 / S2-c: an edit from next month's view applies from next month; this month keeps what it showed.
  await openPlan(page, next);
  await planRow(page, "Home loan EMI").getByRole("link", { name: "Home loan EMI" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit Home loan EMI" })).toBeVisible();
  const from = page.getByLabel("Apply amount, day and account changes from");
  await expect(from).toHaveValue(monthParam(next));
  await expect(from).toHaveAttribute("min", monthParam(thisMonth));
  await page.getByLabel("Amount", { exact: true }).fill("43,000.00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${monthParam(next)}`));
  await expect(planRow(page, "Home loan EMI")).toContainText("₹43,000.00");
  await openPlan(page);
  await expect(planRow(page, "Home loan EMI")).toContainText("₹42,500.00");
  await openPlan(page, monthAfter(2));
  await expect(planRow(page, "Home loan EMI")).toContainText("₹43,000.00");

  // An edit cannot apply from before the current month.
  await page.goto(`/payment-plan?month=${monthParam(monthAfter(-1))}`);
  await planRow(page, "Rent").getByRole("link", { name: "Rent" }).click();
  await expect(page.getByLabel("Apply amount, day and account changes from")).toHaveValue(monthParam(thisMonth));

  // US2 5: skip one month (it counts in no total), undo it; end the item after a month.
  await openPlan(page, next);
  const before = await page.locator("#plan-total-planned").innerText();
  const emi = planRow(page, "Home loan EMI");
  await emi.getByRole("button", { name: /^Skip/ }).click();
  await expect(emi).toHaveAttribute("data-status", "skipped");
  await expect(page.locator("#plan-total-planned")).not.toHaveText(before);
  await emi.getByRole("button", { name: /^Undo skip/ }).click();
  await expect(emi).not.toHaveAttribute("data-status", "skipped");
  await expect(page.locator("#plan-total-planned")).toHaveText(before);

  await planRow(page, "Car loan EMI").getByRole("button", { name: /^End/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End it" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(planRow(page, "Car loan EMI")).toBeVisible();
  await openPlan(page, monthAfter(2));
  await expect(planRow(page, "Car loan EMI")).toHaveCount(0);

  // FR-008: deleting an item keeps its paid months, shown as removed, and removes the rest.
  await openPlan(page);
  await planRow(page, "Rent").getByRole("link", { name: "Rent" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this planned payment?" });
  await expect(dialog).toContainText("paid months stay");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/payment-plan\?month=/);
  await openPlan(page, monthAfter(-1));
  await expect(planRow(page, "Rent")).toContainText("(removed)");
  await expect(planRow(page, "Rent")).toHaveAttribute("data-status", "paid");
  await openPlan(page, monthAfter(2));
  await expect(planRow(page, "Rent")).toHaveCount(0);
});
