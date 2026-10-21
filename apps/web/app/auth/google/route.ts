import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { KEEP_SIGNED_IN_COOKIE, LAST_ACTIVE_COOKIE, markerCookie } from "@/lib/session-cookies";

/**
 * Starts Google sign-in on the server (FR-006): the PKCE verifier and the resulting session live
 * only in HttpOnly cookies (FR-036b). The invitation and verified-email rules are enforced by the
 * Supabase hooks (FR-001, FR-004). The "Keep me signed in" choice is remembered for the callback.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const keepSignedIn = url.searchParams.get("keep") === "1";

  const store = await cookies();
  store.set(KEEP_SIGNED_IN_COOKIE, keepSignedIn ? "1" : "0", markerCookie(keepSignedIn));
  if (!keepSignedIn) store.set(LAST_ACTIVE_COOKIE, String(Date.now()), markerCookie(false));

  const supabase = await createServerSupabase({ keepSignedIn });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
  });
  if (error || !data.url) return NextResponse.redirect(new URL("/sign-in?error=oauth", url.origin));
  return NextResponse.redirect(data.url);
}
