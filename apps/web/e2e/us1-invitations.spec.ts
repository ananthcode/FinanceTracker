import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { completeSetup, seedInvitation, uniqueEmail, userExists } from "./helpers/db";
import { extractLink, latestEmailTo } from "./helpers/mailpit";

/**
 * T048 — User Story 1: invited person joins the app (quickstart S1-a…S1-e).
 * Google ↔ password same-user linking (FR-005, S1-h) is checked manually: the local stack has no
 * Google provider.
 */
const PASSWORD = "violet-kettle-orbit-27";
const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";

async function acceptInvite(page: import("@playwright/test").Page, link: string, email: string) {
  await page.goto(link);
  await page.waitForLoadState("networkidle"); // dev server compiles pages on first visit
  await expect(page.getByRole("heading", { name: "Before you join" })).toBeVisible(); // FR-036e
  await page.getByLabel("Your email").fill(email);
  await page.getByLabel("Choose a password").fill(PASSWORD);
  await page.getByRole("button", { name: "Join with email" }).click();
  // Generous timeout: the first API call compiles the route in `next dev`.
  await expect(page).toHaveURL(/\/setup$/, { timeout: 30_000 });
}

test("owner invites a member, who joins with email and password (S1-a, S1-b)", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("owner");
  const ownerToken = await seedInvitation(ownerEmail, { role: "owner" });
  await acceptInvite(page, `${webBase}/invite/${ownerToken}`, ownerEmail);
  await completeSetup(ownerEmail, "Owner Test");

  const ashaEmail = uniqueEmail("asha");
  const since = new Date();
  await page.goto("/admin");
  await page.getByLabel("Email").fill(ashaEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.locator("#invite-result")).toContainText("Invitation emailed");

  const mail = await latestEmailTo(ashaEmail, { since });
  const link = extractLink(mail, `${webBase}/invite/`);
  const token = link.split("/invite/")[1]!;
  // FR-003a: the token appears only in the email, never in the admin UI.
  expect(await page.content()).not.toContain(token);

  const ashaContext = await browser.newContext();
  const ashaPage = await ashaContext.newPage();
  await acceptInvite(ashaPage, link, ashaEmail);
  expect(await userExists(ashaEmail)).toBe(true);

  // Re-opening the accepted link directs to sign-in (S1-e).
  await ashaContext.clearCookies();
  await ashaPage.goto(link);
  await expect(ashaPage.getByRole("heading", { name: "Already joined" })).toBeVisible();
  await ashaContext.close();
});

test("an uninvited person cannot create access by any route (S1-c)", async () => {
  const ravi = uniqueEmail("ravi");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await anon.auth.signUp({ email: ravi, password: PASSWORD });
  expect(error).not.toBeNull();
  expect(await userExists(ravi)).toBe(false);
});

test("expired, revoked and unknown links show the right message (S1-e)", async ({ page }) => {
  const expired = await seedInvitation(uniqueEmail("exp"), { expired: true });
  await page.goto(`/invite/${expired}`);
  await expect(page.getByText("This invitation has expired")).toBeVisible();

  const revoked = await seedInvitation(uniqueEmail("rev"), { status: "revoked" });
  await page.goto(`/invite/${revoked}`);
  await expect(page.getByText("This invitation has been withdrawn")).toBeVisible();

  await page.goto(`/invite/${"A".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "Invitation not found" })).toBeVisible();
});

test("joining with a different email than invited is refused", async ({ page }) => {
  const invited = uniqueEmail("invited");
  const token = await seedInvitation(invited);
  await page.goto(`/invite/${token}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Your email").fill(uniqueEmail("someone-else"));
  await page.getByLabel("Choose a password").fill(PASSWORD);
  await page.getByRole("button", { name: "Join with email" }).click();
  // Next.js also renders a hidden route-announcer alert; target the form's error.
  await expect(page.locator("#accept-error")).toContainText("different email");
  expect(await userExists(invited)).toBe(false);
});
