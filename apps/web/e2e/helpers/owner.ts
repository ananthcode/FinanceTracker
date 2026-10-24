import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { admin, completeSetup, seedInvitation, uniqueEmail } from "./db";
import { PASSWORD } from "./users";

/**
 * Returns the synthetic owner for this E2E run, creating one if needed. Only one owner may exist
 * (FR-013); every E2E owner is created with the shared test PASSWORD.
 */
export async function ensureOwner(request: APIRequestContext): Promise<string> {
  const { data } = await admin().from("profiles").select("email").eq("role", "owner").maybeSingle();
  if (data?.email) return data.email as string;

  const email = uniqueEmail("owner");
  const token = await seedInvitation(email, { role: "owner" });
  const res = await request.post(`/api/invitations/${token}/accept`, {
    headers: { "x-ft-client": "android" },
    data: { email, password: PASSWORD, keepSignedIn: false, device: "android", privacyNoticeShown: true },
  });
  if (res.status() !== 201) throw new Error(`ensureOwner failed: ${res.status()}`);
  await completeSetup(email, "Owner Test");
  return email;
}

export async function signInUI(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 30_000 });
}
