import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type GoogleResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "invite_required" | "inactive" | "failed" };

/**
 * Google sign-in for Android (T061): Supabase OAuth with PKCE in the system browser, then the
 * code is exchanged in-app. The server-side hooks enforce the invitation and verified-email rules
 * (FR-001, FR-004); a successful sign-in is recorded with `app.record_sign_in`.
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  const client = supabase();
  const redirectTo = Linking.createURL("auth/callback");
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, reason: "failed" };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { ok: false, reason: "cancelled" };

  const { queryParams } = Linking.parse(result.url);
  const problem = `${queryParams?.error_description ?? ""} ${queryParams?.error ?? ""}`;
  if (problem.includes("INVITE_REQUIRED")) return { ok: false, reason: "invite_required" };
  if (problem.includes("USER_INACTIVE")) return { ok: false, reason: "inactive" };

  const code = typeof queryParams?.code === "string" ? queryParams.code : null;
  if (!code) return { ok: false, reason: "failed" };

  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error) {
    if (exchanged.error.message.includes("INVITE_REQUIRED")) return { ok: false, reason: "invite_required" };
    if (exchanged.error.message.includes("USER_INACTIVE")) return { ok: false, reason: "inactive" };
    return { ok: false, reason: "failed" };
  }
  await client.schema("app").rpc("record_sign_in", { p_method: "google", p_device: "android" });
  return { ok: true };
}

export const GOOGLE_MESSAGES: Record<Exclude<GoogleResult, { ok: true }>["reason"], string> = {
  cancelled: "Google sign-in was cancelled.",
  invite_required: "There's no invitation for this Google account's email. Ask the owner to invite you.",
  inactive: "Your access has been disabled. Contact the owner.",
  failed: "Google sign-in isn't available right now. Please try again.",
};
