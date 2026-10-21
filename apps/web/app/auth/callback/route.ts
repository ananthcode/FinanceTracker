import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Google OAuth callback (US1/US2, FR-004). Supabase's hooks have already enforced the invitation
 * and verified-email rules; here we exchange the code for a session and record the sign-in.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const failure = (reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${reason}`, url.origin));

  // Errors from the Before User Created / Custom Access Token hooks come back as query params.
  const description = `${url.searchParams.get("error_description") ?? ""} ${url.searchParams.get("error") ?? ""}`;
  if (description.includes("INVITE_REQUIRED")) return failure("invite_required");
  if (description.includes("USER_INACTIVE")) return failure("inactive");
  if (url.searchParams.get("error")) return failure("oauth");

  const code = url.searchParams.get("code");
  if (!code) return failure("oauth");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    if (error.message.includes("INVITE_REQUIRED")) return failure("invite_required");
    if (error.message.includes("USER_INACTIVE")) return failure("inactive");
    return failure("oauth");
  }

  await supabase.schema("app").rpc("record_sign_in", { p_method: "google", p_device: "web" });
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
