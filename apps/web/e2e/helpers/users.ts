import type { APIRequestContext } from "@playwright/test";
import { completeSetup, seedInvitation } from "./db";

export const PASSWORD = "violet-kettle-orbit-27";

/** Creates an invited, accepted and set-up member through the real accept endpoint. */
export async function createMember(request: APIRequestContext, email: string, password = PASSWORD): Promise<void> {
  const token = await seedInvitation(email);
  const res = await request.post(`/api/invitations/${token}/accept`, {
    headers: { "x-ft-client": "android" },
    data: { email, password, keepSignedIn: false, device: "android", privacyNoticeShown: true },
  });
  if (res.status() !== 201) throw new Error(`createMember failed: ${res.status()} ${await res.text()}`);
  await completeSetup(email, "Test Member");
}

/** Signs in through the API as the Android app would; returns its tokens. */
export async function androidSignIn(request: APIRequestContext, email: string, password = PASSWORD) {
  const res = await request.post("/api/auth/sign-in", {
    headers: { "x-ft-client": "android" },
    data: { email, password, keepSignedIn: true, device: "android" },
  });
  return { status: res.status(), body: (await res.json()) as { accessToken?: string; refreshToken?: string; error?: { code: string } } };
}
