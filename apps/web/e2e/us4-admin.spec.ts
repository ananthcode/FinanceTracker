import { expect, test } from "@playwright/test";
import { admin, uniqueEmail, userExists } from "./helpers/db";
import { extractLink, latestEmailTo } from "./helpers/mailpit";
import { ensureOwner, signInUI } from "./helpers/owner";
import { androidSignIn, createMember, PASSWORD } from "./helpers/users";

/** T088 — User Story 4: owner-admin manages invitations and access (quickstart S4-a…S4-e, SEC-d). */
const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";

async function inviteViaUI(page: import("@playwright/test").Page, email: string): Promise<string> {
  const since = new Date();
  await page.goto("/admin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.locator("#invite-result")).toContainText("Invitation emailed");
  return extractLink(await latestEmailTo(email, { since }), `${webBase}/invite/`);
}

test("owner sees invitations and users, but never preferences or financial data (S4-a)", async ({ page, request }) => {
  const owner = await ensureOwner(request);
  const member = uniqueEmail("listed");
  await createMember(request, member);
  await signInUI(page, owner);
  await page.goto("/admin");
  const users = page.locator("#users-table");
  await expect(users).toContainText(member);
  await expect(users).toContainText("active");
  // FR-016: no preferences (e.g. timezone) are exposed in the admin area.
  expect(await page.locator("main").innerText()).not.toContain("Asia/Kolkata");
});

test("revoke and resend invitations (S4-a)", async ({ page, request, browser }) => {
  const owner = await ensureOwner(request);
  await signInUI(page, owner);

  const revokedEmail = uniqueEmail("revokeme");
  const revokedLink = await inviteViaUI(page, revokedEmail);
  await page.reload();
  await page.locator("#invitations-table tr", { hasText: revokedEmail }).getByRole("button", { name: "Revoke" }).click();
  await expect(page.locator("#invitations-table tr", { hasText: revokedEmail })).toContainText("revoked");

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(revokedLink);
  await expect(visitor.getByText("This invitation has been withdrawn")).toBeVisible();

  const resendEmail = uniqueEmail("resendme");
  const firstLink = await inviteViaUI(page, resendEmail);
  await page.reload();
  const since = new Date();
  await page.locator("#invitations-table tr", { hasText: resendEmail }).getByRole("button", { name: "Resend" }).click();
  const secondLink = extractLink(await latestEmailTo(resendEmail, { since }), `${webBase}/invite/`);
  expect(secondLink).not.toBe(firstLink);
  await visitor.goto(firstLink);
  await expect(visitor.getByRole("heading", { name: "Invitation not found" })).toBeVisible(); // superseded
  await visitor.goto(secondLink);
  await expect(visitor.getByRole("heading", { name: "Join Finance Tracker" })).toBeVisible();
});

test("disable signs the member out everywhere; re-enable restores access with data intact (S4-b, S4-c)", async ({ page, request, browser }) => {
  const owner = await ensureOwner(request);
  const member = uniqueEmail("disableme");
  await createMember(request, member);
  const memberId = (await admin().from("profiles").select("user_id").eq("email", member).single()).data!.user_id;
  await admin().from("user_preferences").update({ number_format: "international" }).eq("user_id", memberId);

  const memberPage = await (await browser.newContext()).newPage();
  await signInUI(memberPage, member);

  await signInUI(page, owner);
  await page.goto("/admin");
  const row = page.locator("#users-table tr", { hasText: member });
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row).toContainText("disabled");

  // The member's next request is refused and the browser is signed out (SC-007).
  await memberPage.goto("/settings");
  await expect(memberPage).toHaveURL(/\/(signed-out|sign-in)/);
  const refused = await androidSignIn(request, member);
  expect(refused.body.error?.code).toBe("USER_INACTIVE");

  await page.locator("#users-table tr", { hasText: member }).getByRole("button", { name: "Enable" }).click();
  await expect(page.locator("#users-table tr", { hasText: member })).toContainText("active");
  expect((await androidSignIn(request, member)).status).toBe(200);
  const { data: prefs } = await admin().from("user_preferences").select("number_format").eq("user_id", memberId).single();
  expect(prefs?.number_format).toBe("international"); // data intact
});

test("erase needs the exact email, then removes the user and every trace of their identity (S4-d, SEC-d)", async ({ page, request }) => {
  const owner = await ensureOwner(request);
  const member = uniqueEmail("eraseme");
  await createMember(request, member);
  await signInUI(page, owner);
  await page.goto("/admin");

  const row = page.locator("#users-table tr", { hasText: member });
  await row.getByRole("button", { name: "Erase" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("Type the user's email to confirm").fill("wrong@example.com");
  await expect(dialog.getByRole("button", { name: "Erase permanently" })).toBeDisabled();
  await dialog.getByLabel("Type the user's email to confirm").fill(member);
  await dialog.getByRole("button", { name: "Erase permanently" }).click();
  await expect(page.locator("#users-table")).not.toContainText(member);

  expect(await userExists(member)).toBe(false);
  const db = admin();
  const { count: auditMentions } = await db
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .or(`actor_ref.ilike.${member},target_ref.ilike.${member}`);
  expect(auditMentions).toBe(0);
  const { count: invites } = await db.from("invitations").select("id", { count: "exact", head: true }).eq("email", member);
  expect(invites).toBe(0);
  await expect(page.locator("#audit-feed")).toContainText("erased:");

  // The email can be invited again as a brand-new user.
  await inviteViaUI(page, member);
});

test("a member cannot reach user management (S4-e)", async ({ page, request }) => {
  await ensureOwner(request);
  const member = uniqueEmail("nosy");
  await createMember(request, member);
  await signInUI(page, member);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
  const api = await page.request.get("/api/admin/overview");
  expect(api.status()).toBe(403);
});

test("the owner cannot be disabled or erased", async ({ request }) => {
  const owner = await ensureOwner(request);
  const ownerId = (await admin().from("profiles").select("user_id").eq("email", owner).single()).data!.user_id as string;
  const signIn = await androidSignIn(request, owner, PASSWORD);
  const headers = { authorization: `Bearer ${signIn.body.accessToken}`, "x-ft-client": "android" };
  expect((await request.post(`/api/admin/users/${ownerId}/disable`, { headers })).status()).toBe(409);
  expect((await request.post(`/api/admin/users/${ownerId}/erase`, { headers, data: { confirmEmail: owner } })).status()).toBe(409);
});
