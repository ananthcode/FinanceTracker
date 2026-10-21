import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { admin, uniqueEmail } from "./helpers/db";
import { countEmailsTo, extractLink, latestEmailTo } from "./helpers/mailpit";
import { androidSignIn, createMember, PASSWORD } from "./helpers/users";

/** T065 — User Story 2: sign in, stay signed in, reset, lockout, sign out (quickstart S2-a…S2-e, SEC-a). */

async function signIn(page: Page, email: string, password: string, keep = false) {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  if (keep) await page.getByLabel("Keep me signed in on this browser").check();
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("sign in, see own activity, sign out (S2-a, S2-e)", async ({ page, request }) => {
  const email = uniqueEmail("signin");
  await createMember(request, email);

  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  await page.goto("/settings");
  await expect(page.getByRole("cell", { name: "Signed in" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in/); // session ended on this browser
});

test("signing out on one device leaves the other signed in (S2-e)", async ({ page, request }) => {
  const email = uniqueEmail("twodev");
  await createMember(request, email);
  const android = await androidSignIn(request, email);
  expect(android.status).toBe(200);

  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  // The Android session still works.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await anon.auth.refreshSession({ refresh_token: android.body.refreshToken! });
  expect(error).toBeNull();
});

test("five wrong passwords lock the email for 15 minutes (S2-c, FR-009)", async ({ page, request }) => {
  const email = uniqueEmail("lock");
  await createMember(request, email);

  for (let i = 0; i < 4; i++) {
    expect((await androidSignIn(request, email, "wrong-password-123")).body.error?.code).toBe("INVALID_CREDENTIALS");
  }
  await signIn(page, email, "wrong-password-123");
  await expect(page.locator("#sign-in-error")).toContainText("Too many failed attempts");

  // Even the correct password is refused while locked.
  const correct = await androidSignIn(request, email);
  expect(correct.status).toBe(423);
  expect(correct.body.error?.code).toBe("LOCKED");
});

test("password reset: neutral reply, link works once, old password and other sessions end (S2-d)", async ({ page, request }) => {
  const email = uniqueEmail("reset");
  await createMember(request, email);
  const other = await androidSignIn(request, email);
  expect(other.status).toBe(200);

  // Unknown emails get the same neutral reply.
  await page.goto("/forgot-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByRole("button", { name: "Send reset link" }).click();
  const neutral = await page.locator("#reset-sent").innerText();

  const since = new Date();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("#reset-sent")).toHaveText(neutral);

  const mail = await latestEmailTo(email, { since, timeoutMs: 20_000 });
  const link = extractLink(mail, "http://localhost:3000/auth/confirm");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("New password").fill("football"); // in the published 10k list
  await expect(page.locator("#new-password-hint")).toContainText("too common");
  await page.getByLabel("New password").fill("amber-lantern-quartz-58");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  expect((await androidSignIn(request, email)).body.error?.code).toBe("INVALID_CREDENTIALS"); // old password
  expect((await androidSignIn(request, email, "amber-lantern-quartz-58")).status).toBe(200);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await anon.auth.refreshSession({ refresh_token: other.body.refreshToken! });
  expect(error).not.toBeNull(); // the other session was ended

  // The link is single-use.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/forgot-password\?error=link/);
});

test("at most 3 reset emails per address per hour, same neutral reply (SEC-a, FR-008a)", async ({ request }) => {
  const email = uniqueEmail("ratelimit");
  await createMember(request, email);
  const since = new Date();
  for (let i = 0; i < 4; i++) {
    const res = await request.post("/api/auth/password-reset", {
      headers: { "x-ft-client": "android" },
      data: { email },
    });
    expect(res.status()).toBe(202);
  }
  // Our limiter's own record: only allowed requests are passed to the auth service and audited.
  // (Supabase applies further throttles of its own, so counting emails would be misleading.)
  const emailRef = createHash("sha256").update(email).digest("hex");
  const { count } = await admin()
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("action", "password_reset_requested")
    .eq("details->>emailRef", emailRef)
    .gte("occurred_at", since.toISOString());
  expect(count).toBe(3);
  expect(await countEmailsTo(email, since)).toBeLessThanOrEqual(3);
});

test("without 'Keep me signed in' an idle session ends after 30 minutes (S2-b)", async ({ page, request }) => {
  const email = uniqueEmail("idle");
  await createMember(request, email);
  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  // The auth cookie is a browser-session cookie (no expiry).
  const auth = (await page.context().cookies()).find((c) => c.name.includes("auth-token"));
  expect(auth?.expires).toBe(-1);

  // Pretend the last activity was 31 minutes ago.
  await page.context().addCookies([
    { name: "ft_last_active", value: String(Date.now() - 31 * 60_000), url: "http://localhost:3000" },
  ]);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in\?reason=idle/);
  await expect(page.locator("#sign-in-notice")).toContainText("30 minutes of inactivity");
});

test("with 'Keep me signed in' the session cookie persists (S2-a)", async ({ page, request }) => {
  const email = uniqueEmail("keep");
  await createMember(request, email);
  await signIn(page, email, PASSWORD, true);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  const auth = (await page.context().cookies()).find((c) => c.name.includes("auth-token"));
  expect(auth?.expires ?? -1).toBeGreaterThan(Date.now() / 1000);
});
