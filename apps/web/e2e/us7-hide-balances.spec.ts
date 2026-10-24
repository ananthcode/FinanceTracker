import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers/db";
import { ensureOwner, signInUI } from "./helpers/owner";
import { createMember } from "./helpers/users";

/** T115 — User Story 7 on web: hide-balances (quickstart S7-a; FR-031–FR-033, SC-006). */
test("the toggle masks every amount, persists on reload, and leaves other browsers alone (S7-a)", async ({
  page,
  request,
  browser,
}) => {
  await ensureOwner(request);
  const member = uniqueEmail("hide");
  await createMember(request, member);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInUI(page, member);
  await page.goto("/settings");

  const preview = page.locator("#format-preview");
  await expect(preview).toContainText(/₹[\d,]+\.\d{2}/);

  const toggle = page.getByRole("switch", { name: "Hide balances" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(preview).toContainText("₹••••");
  // SC-006: no unmasked amount left anywhere on the screen.
  expect(await page.locator("main").innerText()).not.toMatch(/₹\s?[\d,]+\.\d{2}/);

  await page.reload();
  await expect(page.getByRole("switch", { name: "Hide balances" })).toHaveAttribute("aria-checked", "true");
  await expect(preview).toContainText("₹••••");

  // FR-033: another browser (device) of the same user is unaffected.
  const other = await (await browser.newContext()).newPage();
  await other.setViewportSize({ width: 1280, height: 800 });
  await signInUI(other, member);
  await other.goto("/settings");
  await expect(other.locator("#format-preview")).toContainText(/₹[\d,]+\.\d{2}/);

  // Switching off restores amounts at once, without a reload.
  await page.getByRole("switch", { name: "Hide balances" }).click();
  await expect(preview).toContainText(/₹[\d,]+\.\d{2}/);
});

test("on narrow screens the toggle is in the top bar", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("hidenarrow");
  await createMember(request, member);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInUI(page, member);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Hide balances" }).click();
  await expect(page.locator("#format-preview")).toContainText("₹••••");
});
