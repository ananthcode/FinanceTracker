import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { SessionResponse } from "@ft/core";
import { audit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { KEEP_SIGNED_IN_COOKIE, LAST_ACTIVE_COOKIE, markerCookie } from "@/lib/session-cookies";

export type SignInOutcome =
  | { ok: true; session: SessionResponse; userId: string }
  | { ok: false; reason: "invalid_credentials" | "locked" | "inactive" };

/**
 * Signs in with email + password and hands the session to the caller: auth cookies for the web
 * (respecting "Keep me signed in" — FR-010), tokens for Android. Records the sign-in (FR-037).
 */
export async function issuePasswordSession(input: {
  email: string;
  password: string;
  keepSignedIn: boolean;
  client: "web" | "android";
}): Promise<SignInOutcome> {
  let result;
  if (input.client === "web") {
    const store = await cookies();
    store.set(KEEP_SIGNED_IN_COOKIE, input.keepSignedIn ? "1" : "0", markerCookie(input.keepSignedIn));
    if (!input.keepSignedIn) store.set(LAST_ACTIVE_COOKIE, String(Date.now()), markerCookie(false));
    const supabase = await createServerSupabase({ keepSignedIn: input.keepSignedIn });
    result = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  } else {
    const anon = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    result = await anon.auth.signInWithPassword({ email: input.email, password: input.password });
  }

  if (result.error || !result.data.session) {
    const message = result.error?.message ?? "";
    // Errors raised by our Custom Access Token hook (research R-05/R-06).
    if (message.includes("LOCKED")) return { ok: false, reason: "locked" };
    if (message.includes("USER_INACTIVE")) return { ok: false, reason: "inactive" };
    return { ok: false, reason: "invalid_credentials" };
  }

  const { session, user } = result.data;
  const { data: profile } = await adminSupabase()
    .from("profiles")
    .select("setup_completed_at")
    .eq("user_id", user.id)
    .single();
  await adminSupabase().from("profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("user_id", user.id);
  await audit("sign_in_succeeded", {
    actorId: user.id,
    actorRef: input.email,
    targetType: "session",
    targetId: user.id,
    device: input.client,
    details: { method: "password" },
  });

  const body: SessionResponse = {
    user: { id: user.id, email: input.email, setupComplete: profile?.setup_completed_at != null },
  };
  if (input.client === "android") {
    body.accessToken = session.access_token;
    body.refreshToken = session.refresh_token;
    body.expiresAt = session.expires_at;
  }
  return { ok: true, session: body, userId: user.id };
}
