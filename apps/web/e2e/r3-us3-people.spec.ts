import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { addPerson } from "./helpers/lists";

/** R3 T046 — User Story 3: what I owe people and what they owe me (spec US3 1–6; quickstart S3-a … S3-c). */

const row = (page: import("@playwright/test").Page, name: string) => page.locator(`[data-person-name='${name}']`);

test("people with balances in both directions and the two totals (US3 1–3, S3-a)", async ({ page, request }) => {
  await newSignedInMember(page, request, "people");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
  await expect(page.getByText("No people yet.")).toBeVisible();

  await addPerson(page, { name: "Ravi Kumar", amount: "15,000.00", direction: "They owe me", date: "2026-04-01" });
  await addPerson(page, { name: "Meera Iyer", amount: "4500", direction: "I owe them" });
  await addPerson(page, { name: "Anil Rao" });

  await expect(row(page, "Ravi Kumar")).toContainText("owes you ₹15,000.00");
  await expect(row(page, "Meera Iyer")).toContainText("you owe ₹4,500.00");
  await expect(row(page, "Anil Rao")).toContainText("settled");
  await expect(page.locator("#people-owe-you")).toHaveText("₹15,000.00");
  await expect(page.locator("#you-owe-people")).toHaveText("₹4,500.00");
});

test("a future opening date is refused (US3 5)", async ({ page, request }) => {
  await newSignedInMember(page, request, "peopledate");
  await page.goto("/people/new");
  await page.getByLabel("Name", { exact: true }).fill("Future Friend");
  await page.getByLabel("Amount").fill("100");
  await page.getByLabel("Balance on").fill("2099-01-01");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText("The date must be today or earlier.")).toBeVisible();
  await expect(page).toHaveURL(/\/people\/new$/);
});

test("the net-worth switch moves a person's balance into the accounts summary (US3 6, S3-b)", async ({ page, request }) => {
  await newSignedInMember(page, request, "peoplenw");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "52,340.50" });
  await expect(page.locator("#figure-owned")).toContainText("₹52,340.50");
  await expect(page.locator("#figure-net-worth")).toContainText("₹52,340.50");

  await addPerson(page, { name: "Ravi Kumar", amount: "15,000", direction: "They owe me" });
  await page.goto("/accounts");
  await expect(page.locator("#figure-owned")).toContainText("₹52,340.50"); // off by default
  await expect(page.locator("#figure-people")).toHaveCount(0);

  await page.goto("/people");
  await page.getByRole("link", { name: "Ravi Kumar" }).click();
  await page.getByLabel("Include in net worth").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(row(page, "Ravi Kumar")).toContainText("In net worth");

  await page.goto("/accounts");
  await expect(page.locator("#figure-owned")).toContainText("₹67,340.50");
  await expect(page.locator("#figure-net-worth")).toContainText("₹67,340.50");
  await expect(page.locator("#figure-people")).toContainText("they owe you ₹15,000.00");

  // Turning it off reverses it.
  await page.goto("/people");
  await page.getByRole("link", { name: "Ravi Kumar" }).click();
  // Until the page is interactive a click is not handled: retry until the save lands on People.
  await expect(async () => {
    await page.getByLabel("Include in net worth").uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/people$/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await page.goto("/accounts");
  await expect(page.locator("#figure-net-worth")).toContainText("₹52,340.50");
});

test("hide balances masks every amount on People (US3 4, S3-c)", async ({ page, request }) => {
  await newSignedInMember(page, request, "peoplehide");
  await page.setViewportSize({ width: 1280, height: 800 });
  await addPerson(page, { name: "Ravi Kumar", amount: "15,000", direction: "They owe me" });
  await page.getByRole("switch", { name: "Hide balances" }).click();
  await page.goto("/people");
  await expect(page.locator("main")).toContainText("₹••••");
  expect(await page.locator("main").innerText()).not.toMatch(/₹\s?[\d,]+\.\d{2}/);
});
