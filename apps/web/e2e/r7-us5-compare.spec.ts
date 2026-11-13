import { monthName } from "@ft/core";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { monthAfter, openPlan, paise } from "./helpers/plan";

/** R7 T030 — User Story 5: comparison with last month and the people panel (spec US5 1–2; S5-a; SC-006). */

test("the plan compares with last month in words, and the people panel equals the People screen (US5 1, 2, S5-a)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "plancompare");
  await loadDemoFromSettings(page);

  await page.goto("/people");
  const people = {
    owe: paise(await page.locator("#people-owe-you").innerText()),
    owed: paise(await page.locator("#you-owe-people").innerText()),
  };

  await openPlan(page);
  const compare = page.locator("#plan-compare");
  await expect(compare.getByRole("heading", { level: 2 })).toHaveText(`Compared with ${monthName(monthAfter(-1))}`);
  // The difference in words: "more", "less" or "the same" — and it is the difference of the two planned totals.
  const words = await page.locator("#plan-compare-words").innerText();
  expect(words).toMatch(/^Planned (₹[\d,]+\.\d{2} (more|less) than last month|the same as last month)\.$/);
  const planned = paise(await page.locator("#plan-compare-planned").innerText());
  const lastPlanned = paise(await page.locator("#plan-compare-last-planned").innerText());
  const difference = planned > lastPlanned ? planned - lastPlanned : lastPlanned - planned;
  if (difference === 0n) expect(words).toContain("the same");
  else {
    expect(paise(words)).toBe(difference);
    expect(words).toContain(planned > lastPlanned ? "more" : "less");
  }
  // Each item shows last month's paid amount beside this month's plan.
  await expect(compare.locator("[data-compare-row='Rent']")).toContainText("₹25,000.00");
  await expect(compare.locator("[data-compare-row='Home loan EMI']")).toContainText("Nothing");

  // US5 2: people with a balance, in words; totals equal the People screen; a person opens.
  const panel = page.locator("#plan-people");
  expect(paise(await page.locator("#plan-people-owe-you").innerText())).toBe(people.owe);
  expect(paise(await page.locator("#plan-you-owe-people").innerText())).toBe(people.owed);
  await expect(panel.locator("[data-plan-person='Ravi Kumar']")).toContainText("owes you");
  await expect(panel.locator("[data-plan-person='Meera Iyer']")).toContainText("you owe");
  await panel.getByRole("link", { name: "Ravi Kumar" }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
});
