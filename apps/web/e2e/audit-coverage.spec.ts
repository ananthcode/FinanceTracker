import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { admin, seedInvitation, uniqueEmail } from "./helpers/db";
import { extractLink, latestEmailTo } from "./helpers/mailpit";
import { ensureOwner } from "./helpers/owner";
import { androidSignIn, createMember, PASSWORD } from "./helpers/users";

/**
 * T122 — SC-008: drives the R1 flows and checks that every FR-037 action is recorded, and that no
 * audit event carries a password, PIN, token or amount.
 *
 * Covered elsewhere: `invitation_delivery_failed` (lib/invitations.int.test.ts — needs a failing
 * mail server) and `owner_recovered` (supabase/tests/admin.test.sql — moves the owner role).
 * `app_lock_enabled` / `app_lock_disabled` arrive with US6 (Android app lock, deferred).
 */
const DRIVEN_HERE = [
  "invitation_created",
  "invitation_resent",
  "invitation_revoked",
  "invitation_accepted",
  "invitation_expired",
  "user_disabled",
  "user_enabled",
  "user_erased",
  "sign_in_succeeded",
  "sign_in_failed",
  "sign_in_locked",
  "password_reset_requested",
  "password_reset_completed",
  "signed_out",
  "preference_changed",
  "setup_completed",
] as const;
const NEW_PASSWORD = "amber-lantern-quartz-58";

function bearer(token: string) {
  return { authorization: `Bearer ${token}`, "x-ft-client": "android" };
}

async function userId(email: string): Promise<string> {
  const { data } = await admin().from("profiles").select("user_id").eq("email", email).single();
  return data!.user_id as string;
}

async function ownerHeaders(request: APIRequestContext) {
  const owner = await ensureOwner(request);
  const signIn = await androidSignIn(request, owner, PASSWORD);
  expect(signIn.status).toBe(200);
  return bearer(signIn.body.accessToken!);
}

test("every FR-037 action is recorded, and no event holds a secret or an amount (SC-008)", async ({ page, request }) => {
  test.setTimeout(120_000);
  const since = new Date(Date.now() - 1000).toISOString();
  const owner = await ownerHeaders(request);

  // Invitations: created → resent → revoked; one expired; one accepted (createMember).
  const invited = uniqueEmail("audit-inv");
  expect((await request.post("/api/admin/invitations", { headers: owner, data: { email: invited } })).status()).toBe(201);
  const firstId = (await admin().from("invitations").select("id").eq("email", invited).single()).data!.id as string;
  expect((await request.post(`/api/admin/invitations/${firstId}/resend`, { headers: owner })).ok()).toBe(true);
  const { data: current } = await admin().from("invitations").select("id").eq("email", invited).eq("status", "pending").single();
  expect((await request.post(`/api/admin/invitations/${current!.id}/revoke`, { headers: owner })).ok()).toBe(true);

  const expiredToken = await seedInvitation(uniqueEmail("audit-exp"), { expired: true });
  await request.get(`/api/invitations/${expiredToken}`);

  // A member joins (invitation accepted), completes setup through the real endpoint, changes a
  // preference and signs out.
  const member = uniqueEmail("audit-member");
  const memberToken = await seedInvitation(member);
  const accepted = await request.post(`/api/invitations/${memberToken}/accept`, {
    headers: { "x-ft-client": "android" },
    data: { email: member, password: PASSWORD, keepSignedIn: true, device: "android", privacyNoticeShown: true },
  });
  expect(accepted.status()).toBe(201);
  const memberHeaders = bearer(((await accepted.json()) as { accessToken: string }).accessToken);
  const setup = await request.post("/api/me/setup", {
    headers: memberHeaders,
    data: {
      displayName: "Audit Member",
      baseCurrency: "INR",
      numberFormat: "indian",
      dateFormat: "dd-MMM-yyyy",
      fyStartMonth: 4,
      timezone: "Asia/Kolkata",
    },
  });
  expect(setup.ok()).toBe(true);
  expect((await androidSignIn(request, member)).status).toBe(200);
  expect(
    (await request.patch("/api/me/preferences", { headers: memberHeaders, data: { numberFormat: "international" } })).ok(),
  ).toBe(true);
  expect((await request.post("/api/auth/sign-out", { headers: memberHeaders, data: { device: "android" } })).ok()).toBe(true);

  // Failed sign-ins, then a lockout.
  const locked = uniqueEmail("audit-lock");
  await createMember(request, locked);
  for (let i = 0; i < 5; i++) await androidSignIn(request, locked, "wrong-password-123");

  // Password reset: requested, then completed through the emailed link.
  const resetter = uniqueEmail("audit-reset");
  await createMember(request, resetter);
  const mailSince = new Date();
  await page.goto("/forgot-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(resetter);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("#reset-sent")).toBeVisible();
  const link = extractLink(await latestEmailTo(resetter, { since: mailSince, timeoutMs: 20_000 }), "http://localhost:3000/auth/confirm");
  await page.goto(link);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  // Owner disables, re-enables and erases a member.
  const target = uniqueEmail("audit-target");
  await createMember(request, target);
  const targetId = await userId(target);
  expect((await request.post(`/api/admin/users/${targetId}/disable`, { headers: owner })).ok()).toBe(true);
  expect((await request.post(`/api/admin/users/${targetId}/enable`, { headers: owner })).ok()).toBe(true);
  expect(
    (await request.post(`/api/admin/users/${targetId}/erase`, { headers: owner, data: { confirmEmail: target } })).ok(),
  ).toBe(true);

  // Every action driven above is in the audit history.
  const { data: events, error } = await admin()
    .from("audit_events")
    .select("action, actor_ref, target_ref, details")
    .gte("occurred_at", since);
  expect(error).toBeNull();
  const recorded = new Set(events!.map((e) => e.action as string));
  const missing = DRIVEN_HERE.filter((a) => !recorded.has(a));
  expect(missing, "FR-037 actions with no audit event").toEqual([]);

  // No event contains a password, PIN, token or amount — by key or by value.
  const secrets = [PASSWORD, NEW_PASSWORD, "wrong-password-123", expiredToken];
  for (const e of events!) {
    const json = JSON.stringify(e);
    for (const s of secrets) expect(json, `${e.action} leaks a secret`).not.toContain(s);
    const details = (e.details ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(details)) {
      expect(key, `${e.action} detail key`).not.toMatch(/token|password|pin|secret|hash|amount|balance/i);
      expect(String(value), `${e.action} detail value looks like a token`).not.toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(String(value), `${e.action} detail value looks like money`).not.toMatch(/₹\s?[\d,]+/);
    }
  }
});
