import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { newSignedInMember } from "./helpers/accounts";
import { loadDemoFromSettings } from "./helpers/data";
import { pickPayee, transactionRows } from "./helpers/transactions";

/** R8 T017 — User Story 2: make and manage templates (spec US2 1–6; quickstart S2-a, S2-b; SC-003, SC-005). */

const quickNames = (page: Page) => page.locator("#quick-add [data-template]").evaluateAll((els) => els.map((e) => e.getAttribute("data-template")));
const manageRow = (page: Page, name: string) => page.locator(`[data-manage-template='${name}']`);

test("Save as template, order, hide and show (US2 2, 3, 5, S2-a, S2-b, SC-003, SC-005)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "tplmanage");
  await loadDemoFromSettings(page);

  // S2-a / SC-003: from a recorded transaction, in a few selections.
  const started = Date.now();
  await page.goto("/transactions");
  await transactionRows(page).filter({ hasText: "Spent at Corner Cafe" }).first().getByRole("link").first().click();
  await page.getByRole("link", { name: "Save as template" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Save as template" })).toBeVisible();
  await expect(page.getByLabel("Template name")).toHaveValue("Corner Cafe");
  await expect(page.getByLabel("Usual amount (optional)")).not.toHaveValue("");
  await expect(page.getByLabel("Date", { exact: true })).toHaveCount(0); // no date, status or reference
  await expect(page.getByLabel("Status")).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(manageRow(page, "Corner Cafe")).toBeVisible();

  // New templates go last; Move to top puts it first, on Transactions too (SC-005: the same order everywhere).
  await manageRow(page, "Corner Cafe").getByRole("button", { name: "Move to top Corner Cafe" }).click();
  await expect(page.locator("[data-manage-template]").first()).toHaveAttribute("data-manage-template", "Corner Cafe");
  await page.goto("/transactions");
  expect((await quickNames(page))[0]).toBe("Corner Cafe");

  // Move down by one.
  await page.goto("/templates");
  await manageRow(page, "Corner Cafe").getByRole("button", { name: "Move down Corner Cafe" }).click();
  await expect(page.locator("[data-manage-template]").nth(1)).toHaveAttribute("data-manage-template", "Corner Cafe");

  // Hide: off the quick-add list, kept here; Show brings it back.
  await manageRow(page, "Milk").getByRole("button", { name: "Hide Milk" }).click();
  await expect(manageRow(page, "Milk")).toContainText("hidden");
  await page.goto("/transactions");
  expect(await quickNames(page)).not.toContain("Milk");
  await page.goto("/templates");
  await manageRow(page, "Milk").getByRole("button", { name: "Show Milk" }).click();
  await expect(manageRow(page, "Milk")).not.toContainText("hidden");
  await page.goto("/transactions");
  expect(await quickNames(page)).toContain("Milk");
});

test("make, edit and delete templates; edits never change recordings; ties offer fitting planned payments only (US2 1, 4, 5)", async ({ page, request }) => {
  test.slow();
  await newSignedInMember(page, request, "tpledit");
  await loadDemoFromSettings(page);

  // Record Milk at ₹60.00, then change the template to ₹65.00: the recording stays ₹60.00.
  await page.goto("/transactions");
  await page.locator("#quick-add [data-template='Milk']").getByRole("button", { name: "Record Milk" }).click();
  await expect(page.locator("#quick-add-done")).toContainText("Recorded Milk");
  await page.goto("/templates");
  await manageRow(page, "Milk").getByRole("link", { name: "Edit Milk" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit template Milk" })).toBeVisible();
  await page.getByLabel("Usual amount (optional)").fill("65.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(manageRow(page, "Milk")).toContainText("₹65.00");
  await page.goto("/transactions");
  await expect(page.locator("#quick-add [data-template='Milk']").getByLabel("Amount for Milk")).toHaveValue("65.00");
  await expect(transactionRows(page).filter({ hasText: "Spent at Sunrise Dairy" }).filter({ hasText: "₹60.00" }).first()).toBeVisible();

  // A new template: names are unique; a person repayment can be tied to the plan's matching item.
  await page.goto("/templates/new");
  await page.getByLabel("Template name").fill("milk");
  await page.getByLabel("Usual amount (optional)").fill("10.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("You already have a template with this name.")).toBeVisible();
  await page.getByLabel("Template name").fill("Pocket money");
  await page.getByRole("group", { name: "Type" }).getByText("Person", { exact: true }).click();
  await page.getByLabel("What happened").selectOption({ label: "Repaid to" });
  await pickPayee(page, "Person", "Meera", "Meera Iyer");
  const tie = page.getByLabel("Pays a planned payment (optional)");
  await expect(tie.locator("option")).toHaveText(["None", "Repay Meera"]);
  await pickPayee(page, "Person", "Ravi", "Ravi Kumar");
  await expect(tie.locator("option")).toHaveText(["None"]);
  await page.getByLabel("Usual amount (optional)").fill("1,000.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(manageRow(page, "Pocket money")).toBeVisible();

  // Delete: gone from the list; recordings stay.
  await manageRow(page, "Milk").getByRole("link", { name: "Edit Milk" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete this template?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(manageRow(page, "Milk")).toHaveCount(0);
  await page.goto("/transactions");
  await expect(transactionRows(page).filter({ hasText: "Spent at Sunrise Dairy" }).filter({ hasText: "₹60.00" }).first()).toBeVisible();
});
