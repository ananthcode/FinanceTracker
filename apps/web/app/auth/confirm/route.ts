import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Verifies a one-time email token (password-reset link) on the server so the resulting session is
 * stored only in HttpOnly cookies (FR-036b). Works in any browser — no PKCE verifier needed.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(new URL("/forgot-password?error=link", url.origin));
  }
  const supabase = await createServerSupabase({ keepSignedIn: false });
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/forgot-password?error=link", url.origin));
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
