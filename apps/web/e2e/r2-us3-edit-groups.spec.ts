import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAccount, newSignedInMember } from "./helpers/accounts";
import { admin } from "./helpers/db";

/** T045 — R2 User Story 3: edit and personalise accounts (quickstart S3-a…S3-c, S4-c; FR-008–FR-011). */

const namesIn = (page: Page, region: string) =>
  page.getByRole("region", { name: region }).locator("[data-account-row] [data-account-name]").allInnerTexts();

async function openEdit(page: Page, name: string) {
  await page.goto("/accounts");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit account" })).toBeVisible();
}

async function accountRow(email: string, name: string) {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", email).single();
  const { data } = await db.from("accounts").select("name, colour, icon, opening_balance_minor, type, group_id, sort_key")
    .eq("user_id", profile!.user_id).eq("name", name).maybeSingle();
  return data;
}

test("editing updates the list and totals at once (S3-a)", async ({ page, request }) => {
  const email = await newSignedInMember(page, request, "edit");
  await addAccount(page, { name: "Cash in hand", type: "Cash", balance: "2000" });
  await openEdit(page, "Cash in hand");
  await page.getByLabel("Name", { exact: true }).fill("Wallet cash");
  await page.getByLabel(/^Opening balance/).fill("2,500");
  await page.getByRole("radio", { name: "Green" }).check();
  await page.getByRole("radio", { name: "Coins" }).check();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("region", { name: "Cash" })).toContainText("Wallet cash");
  await expect(page.locator("#figure-owned")).toContainText("₹2,500.00");
  const row = await accountRow(email, "Wallet cash");
  expect(row).toMatchObject({ colour: "green", icon: "coins", opening_balance_minor: 250000 });
});

test("reordering by button and by keyboard drag is kept across reloads and devices (FR-010)", async ({ page, request, browser }) => {
  const email = await newSignedInMember(page, request, "order");
  for (const name of ["Alpha cash", "Beta cash", "Gamma cash"]) await addAccount(page, { name, type: "Cash", balance: "100" });
  await expect.poll(() => namesIn(page, "Cash")).toEqual(["Alpha cash", "Beta cash", "Gamma cash"]);

  await page.getByRole("button", { name: "Move Gamma cash up" }).click();
  await expect.poll(() => namesIn(page, "Cash")).toEqual(["Alpha cash", "Gamma cash", "Beta cash"]);
  await page.waitForLoadState("networkidle"); // let the refresh after the move land before dragging

  // Keyboard drag: focus the handle, Space to lift, ArrowDown, Space to drop. Keys pressed while the
  // list re-renders after the refresh are lost, so drag again only while the order is unchanged.
  const moved = ["Gamma cash", "Alpha cash", "Beta cash"];
  await expect(async () => {
    if (JSON.stringify(await namesIn(page, "Cash")) !== JSON.stringify(moved)) {
      await page.getByRole("button", { name: "Reorder Alpha cash" }).focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Space");
    }
    await expect.poll(() => namesIn(page, "Cash"), { timeout: 3_000 }).toEqual(moved);
  }).toPass({ timeout: 20_000 });

  await page.waitForLoadState("networkidle"); // the order shows at once; let its save finish before reloading
  await page.reload();
  expect(await namesIn(page, "Cash")).toEqual(["Gamma cash", "Alpha cash", "Beta cash"]);
  const other = await (await browser.newContext()).newPage();
  const { signInUI } = await import("./helpers/owner");
  await signInUI(other, email);
  await other.goto("/accounts");
  await expect.poll(() => namesIn(other, "Cash")).toEqual(["Gamma cash", "Alpha cash", "Beta cash"]);
});

test("changing owned to owed asks first; cancelling keeps the type (S3-b)", async ({ page, request }) => {
  const email = await newSignedInMember(page, request, "type");
  await addAccount(page, { name: "Cash in hand", type: "Cash", balance: "2000" });
  await openEdit(page, "Cash in hand");
  await page.getByLabel("Type").selectOption({ label: "Credit card" });
  await page.getByRole("button", { name: "Save changes" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("owed instead of owned");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect((await accountRow(email, "Cash in hand"))?.type).toBe("cash");
});

test("own groups: create, assign, switch view, remembered, delete moves accounts to Ungrouped (S3-c)", async ({ page, request }) => {
  test.slow(); // many steps; about 27 s on its own
  await newSignedInMember(page, request, "groups");
  await addAccount(page, { name: "Everyday Savings", type: "Bank account", balance: "52,340.50" });
  await addAccount(page, { name: "Family cash", type: "Cash", balance: "2000" });
  await addAccount(page, { name: "Rewards Card", type: "Credit card", balance: "18250" });
  const netWorth = await page.locator("#figure-net-worth dd").innerText();

  await page.goto("/accounts/groups");
  for (const name of ["My accounts", "Held for family"]) {
    await page.getByLabel("New group name").fill(name);
    await page.getByRole("button", { name: "Add group" }).click();
    await expect(page.getByRole("list", { name: "Your groups" })).toContainText(name);
  }

  for (const [account, group] of [["Everyday Savings", "My accounts"], ["Rewards Card", "My accounts"], ["Family cash", "Held for family"]]) {
    await openEdit(page, account!);
    await page.getByLabel("Group").selectOption({ label: group! });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/accounts$/);
  }

  await page.getByRole("radio", { name: "My groups" }).click();
  const mine = page.getByRole("region", { name: "My accounts" });
  await expect(mine).toContainText("Everyday Savings");
  await expect(mine.locator("[data-subtotal]")).toContainText("net"); // mixes owned and owed (FR-017)
  await expect(page.getByRole("region", { name: "Held for family" })).toContainText("Family cash");
  await expect(page.locator("#figure-net-worth dd")).toHaveText(netWorth); // switching views changes no total

  await page.reload();
  await expect(page.getByRole("radio", { name: "My groups" })).toBeChecked(); // remembered (FR-009)

  await page.goto("/accounts/groups");
  await page.getByRole("button", { name: "Delete Held for family" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete group" }).click();
  await expect(page.getByRole("list", { name: "Your groups" })).not.toContainText("Held for family");
  await page.goto("/accounts");
  await expect(page.getByRole("region", { name: "Ungrouped" })).toContainText("Family cash");
  await expect(page.locator("#figure-net-worth dd")).toHaveText(netWorth);
});

test("two tabs editing different fields keep both changes (S4-c)", async ({ page, context, request }) => {
  const email = await newSignedInMember(page, request, "tabs");
  await addAccount(page, { name: "Shared account", type: "Bank account", balance: "100" });
  const tab2 = await context.newPage();
  await openEdit(page, "Shared account");
  await openEdit(tab2, "Shared account");

  await page.getByLabel("Name", { exact: true }).fill("Renamed in tab one");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/accounts$/);

  await tab2.getByRole("radio", { name: "Purple" }).check();
  await tab2.getByRole("button", { name: "Save changes" }).click();
  await expect(tab2).toHaveURL(/\/accounts$/);

  expect(await accountRow(email, "Renamed in tab one")).toMatchObject({ colour: "purple" });
});
