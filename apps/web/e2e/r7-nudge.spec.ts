import type { Page } from "@playwright/test";
import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { addPlanItem, monthAfter, monthParam, openPlan, paise, thisMonth } from "./helpers/plan";

/**
 * R7 T034 — the month-check nudge and the plan part of safe to spend (FR-018, FR-023; quickstart S6-a,
 * S6-b, S7-a; SC-006, SC-008). The nudge reads the date in the browser, so the browser's clock is set
 * to a day of this month; the demo household itself is built for the server's real today.
 */

/** Sets the browser's date to `day` of this month (India), on a blank page so no open screen sees the jump. */
async function onDay(page: Page, day: number): Promise<void> {
  await page.mainFrame().goto("about:blank"); // not page.goto: the fixture waits for the app to hydrate
  await page.clock.setFixedTime(new Date(`${thisMonth.slice(0, 8)}${String(day).padStart(2, "0")}T12:00:00+05:30`));
}

const nudge = (page: Page) => page.locator("#plan-nudge");
const next = monthAfter(1);

test("the nudge shows from the 25th to the 5th until Plan checked; Not now hides it until the next day (S6-a, SC-008)", async ({ page, request }) => {
  test.slow();
  await onDay(page, 3);
  await newSignedInMember(page, request, "nudge");
  await loadDemoFromSettings(page);

  // The 1st to the 5th: about this month.
  await page.goto("/");
  await expect(nudge(page)).toContainText(`Check your plan for ${monthName(thisMonth)}`);

  // Outside the window: nothing, on the Dashboard and on the plan.
  for (const day of [6, 10, 24]) {
    await onDay(page, day);
    await page.goto("/");
    await expect(page.locator("#dash-net-worth")).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);
  }
  await openPlan(page);
  await expect(nudge(page)).toHaveCount(0);

  // From the 25th: about next month, with how many amounts are still estimated; it opens that month.
  await onDay(page, 25);
  await page.goto("/");
  await expect(nudge(page)).toContainText(`Check your plan for ${monthName(next)}`);
  await expect(nudge(page)).toContainText("2 amounts are still estimated");
  await nudge(page).getByRole("link", { name: `Open ${monthName(next)}` }).click();
  await expect(page).toHaveURL(new RegExp(`/payment-plan\\?month=${monthParam(next)}`));
  await expect(page.locator("#plan-month")).toHaveText(monthName(next));

  // Not now: hidden on this browser for the rest of the day, back the next day.
  await nudge(page).getByRole("button", { name: "Not now" }).click();
  await expect(nudge(page)).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator("#dash-net-worth")).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
  await onDay(page, 26);
  await page.goto("/");
  await expect(nudge(page)).toBeVisible();

  // Plan checked: it stops for that month, here and (through the synced preference) on every device.
  await nudge(page).getByRole("button", { name: "Plan checked", exact: true }).click();
  await expect(nudge(page)).toHaveCount(0);
  const me = (await (await page.request.get("/api/me")).json()) as { preferences: { planCheckedMonth: string | null } };
  expect(me.preferences.planCheckedMonth).toBe(next);
  await openPlan(page, next);
  await expect(page.locator("#plan-checked")).toHaveText(`Plan checked for ${monthName(next)}.`);
  await onDay(page, 28);
  await page.goto("/");
  await expect(page.locator("#dash-net-worth")).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
});

test("the Settings switch turns the nudge off; Plan checked is offered on that month's view only (S6-b, FR-023)", async ({ page, request }) => {
  test.slow();
  await onDay(page, 26);
  await newSignedInMember(page, request, "nudgeoff");
  await loadDemoFromSettings(page);
  await page.goto("/");
  await expect(nudge(page)).toBeVisible();

  await page.goto("/settings");
  await page.getByLabel("Remind me to check next month’s plan").uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved. Every screen now uses these settings.")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("#dash-net-worth")).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
  await openPlan(page, next);
  await expect(nudge(page)).toHaveCount(0);

  // The month's own view offers "Plan checked" for the month the nudge is about — not for others.
  await openPlan(page, thisMonth);
  await expect(page.getByRole("button", { name: /^Plan checked for/ })).toHaveCount(0);
  await openPlan(page, monthAfter(2));
  await expect(page.getByRole("button", { name: /^Plan checked for/ })).toHaveCount(0);
  await openPlan(page, next);
  await page.getByRole("button", { name: `Plan checked for ${monthName(next)}` }).click();
  await expect(page.locator("#plan-checked")).toBeVisible();

  // Turned on again: that month stays checked, so there is still no nudge.
  await page.goto("/settings");
  await page.getByLabel("Remind me to check next month’s plan").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved. Every screen now uses these settings.")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("#dash-net-worth")).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
});

test("safe to spend falls by exactly the unpaid plan items it should count (S7-a, SC-006)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "safeplan");
  await loadDemoFromSettings(page);
  await page.goto("/");
  const safe = page.getByRole("region", { name: "Safe to spend" });
  await expect(safe).toContainText("Less still to pay in your plan");
  const planBefore = paise(await page.locator("#safe-plan").innerText());
  const safeBefore = paise(await page.locator("#figure-safe").innerText());
  expect(planBefore).toBeGreaterThan(0n);

  // A new ₹1,000.00 payment from a counted account lowers it by exactly that (while it stays above zero).
  await addPlanItem(page, thisMonth, { name: "Newspaper", payee: "Fresh Mart", amount: "1,000.00", frequency: "Once (this month only)", dueDay: 28 });
  await page.goto("/");
  expect(paise(await page.locator("#safe-plan").innerText()) - planBefore).toBe(100_000n);
  const expected = safeBefore > 100_000n ? safeBefore - 100_000n : 0n;
  expect(paise(await page.locator("#figure-safe").innerText())).toBe(expected);

  // One paid from an account outside net worth, and a card bill, do not change it.
  await addPlanItem(page, thisMonth, { name: "Family help", payee: "Fresh Mart", amount: "7,000.00", from: "Family Savings", frequency: "Once (this month only)", dueDay: 28 });
  await page.goto("/");
  expect(paise(await page.locator("#safe-plan").innerText()) - planBefore).toBe(100_000n);
});
