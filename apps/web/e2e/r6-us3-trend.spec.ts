import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { seedAccounts, seedLists } from "./helpers/db";
import { seedDemoTransactions } from "./helpers/transactions";

/** R6 T014 — User Story 3: income vs spending over time (spec US3 1–3; quickstart S3-a). */

const paise = (text: string) => BigInt(text.replace(/[^\d]/g, "") || "0");

test("12 months of income, spending and net; this month matches the Dashboard; a month opens its drill-down (S3-a)", async ({ page, request }) => {
  test.slow();
  const email = await newSignedInMember(page, request, "trend");
  await seedAccounts(email, { demo: true });
  await seedLists(email, { demo: true });
  await seedDemoTransactions(email);

  await page.goto("/");
  const income = paise(await page.locator("#dash-income").innerText());
  const spending = paise(await page.locator("#dash-spending").innerText());

  await page.goto("/reports?view=trend");
  await expect(page.getByRole("navigation", { name: "Report" }).locator('[aria-current="page"]')).toHaveText("Trend");
  const rows = page.locator("table").filter({ hasText: "Income" }).locator("tbody tr");
  await expect(rows).toHaveCount(12);

  // US3 1: each month has income, spending and net; the last row is this month, as on the Dashboard.
  const last = rows.last();
  const cells = await last.locator("td").allInnerTexts();
  expect(paise(cells[0]!)).toBe(income);
  expect(paise(cells[1]!)).toBe(spending);
  const net = income - spending;
  expect(paise(cells[2]!)).toBe(net < 0n ? -net : net);
  if (net < 0n) expect(cells[2]).toContain("overspent");

  // US3 2: a month opens spending for that month, whose total is the month's spending.
  const previous = rows.nth(10);
  const monthSpending = paise((await previous.locator("td").allInnerTexts())[1]!);
  await previous.getByRole("link").click();
  await expect(page).toHaveURL(/view=spending&period=custom/);
  await expect(page.getByRole("heading", { level: 2, name: /Spending by category/ })).toBeVisible();
  expect(paise(await page.locator("#report-level-total").innerText())).toBe(monthSpending);
});
