import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";

/** R8 T019 — User Story 3: quick add where it is needed (spec US3 1–4; quickstart S3-a, S3-b; FR-013). */

test("the Dashboard strip records in one tap and leads to the full list; the form starts from a template (US3 2, 4, S3-a, S3-b)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "tplwhere");
  await loadDemoFromSettings(page);

  await page.goto("/");
  const strip = page.locator("#quick-add-strip");
  await expect(strip.locator("[data-template]")).toHaveCount(5); // the demo's five (at most 6 are shown)
  await strip.locator("[data-template='Milk']").getByRole("button", { name: "Record Milk" }).click();
  await expect(page.locator("#quick-add-done")).toHaveText("Recorded Milk, ₹60.00, today");
  await strip.getByRole("link", { name: "More" }).click();
  await expect(page).toHaveURL(/\/transactions#quick-add$/);
  await expect(page.locator("#quick-add [data-template]")).toHaveCount(5);

  // S3-b: "Start from a template" fills the form; nothing is saved until Save.
  await page.goto("/transactions/new");
  await page.getByRole("navigation", { name: "Start from a template" }).getByRole("link", { name: "Wallet top-up" }).click();
  await expect(page.getByText("From the template Wallet top-up.")).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("500.00");
  await expect(page.getByLabel("To account")).toHaveValue(/.+/);
});

test("with no templates: no Dashboard strip, and Transactions explains and offers Make a template (US3 3, 4)", async ({ page, request }) => {
  await newSignedInMember(page, request, "tplnone");
  await page.goto("/");
  await expect(page.locator("#quick-add-strip")).toHaveCount(0);
  await page.goto("/transactions");
  await expect(page.locator("#quick-add")).toContainText("A template records something you pay often");
  await page.locator("#quick-add").getByRole("link", { name: "Make a template" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Make a template" })).toBeVisible();
});
