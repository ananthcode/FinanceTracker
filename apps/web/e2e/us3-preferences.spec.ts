import { formatTimestamp } from "@ft/core";
import { expect, test } from "./fixtures";
import { seedInvitation, uniqueEmail } from "./helpers/db";
import { PASSWORD } from "./helpers/users";

/** T079 — User Story 3: first-run setup and regional preferences (quickstart S3-a, S3-b). */

test("setup with defaults, then switching number format updates every amount without reload", async ({ page, request }) => {
  const email = uniqueEmail("prefs");
  const token = await seedInvitation(email);
  const accepted = await request.post(`/api/invitations/${token}/accept`, {
    headers: { "x-ft-client": "android" },
    data: { email, password: PASSWORD, keepSignedIn: false, device: "android", privacyNoticeShown: true },
  });
  expect(accepted.status()).toBe(201);

  // Sign in → setup is required before anything else (FR-020).
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/setup$/, { timeout: 30_000 });
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/setup$/); // every route redirects until setup is done

  // Defaults and live preview (S3-a).
  await expect(page.getByLabel("Base currency")).toHaveValue("INR");
  await expect(page.getByLabel("Timezone")).toHaveValue("Asia/Kolkata");
  const preview = page.locator("#format-preview");
  await expect(preview).toContainText("₹12,34,567.00");
  const today = formatTimestamp(new Date(), { dateFormat: "dd-MMM-yyyy", timezone: "Asia/Kolkata" });
  await expect(preview).toContainText(today);

  await page.getByLabel("Display name").fill("Prefs Test");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  // Settings: base currency is fixed; switching grouping applies immediately (S3-b, SC-005).
  await page.goto("/settings");
  await expect(page.locator("#base-currency")).toContainText("INR");
  await expect(page.locator("#base-currency")).toContainText("can't be changed");
  await page.getByLabel("International (1,234,567)").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("#preferences-status")).toContainText("Saved");
  await expect(page.locator("#format-preview")).toContainText("₹1,234,567.00");

  // A different date format also applies at once.
  await page.getByLabel("Date format").selectOption("yyyy-MM-dd");
  await page.getByRole("button", { name: "Save preferences" }).click();
  const iso = formatTimestamp(new Date(), { dateFormat: "yyyy-MM-dd", timezone: "Asia/Kolkata" });
  await expect(page.locator("#format-preview")).toContainText(iso);
});
