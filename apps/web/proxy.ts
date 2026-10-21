import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applySessionCookiePolicy,
  isIdleExpired,
  KEEP_SIGNED_IN_COOKIE,
  LAST_ACTIVE_COOKIE,
  markerCookie,
} from "@/lib/session-cookies";

/** Routes reachable without a session. */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/forgot-password",
  "/reset-password",
  "/invite/",
  "/auth/",
  "/config-error",
  "/unavailable",
  "/signed-out",
  "/.well-known/",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

const IDLE_MINUTES = Number(process.env.IDLE_MINUTES ?? 30);

/**
 * Next.js 16 proxy (formerly middleware): refreshes the Supabase session cookie, enforces sign-in,
 * the 30-minute idle rule for sessions not kept signed in (FR-010), first-run setup (FR-020) and the
 * owner-only admin area (FR-018). API routes do their own auth in the route wrapper.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });
  const keepSignedIn = request.cookies.get(KEEP_SIGNED_IN_COOKIE)?.value === "1";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, applySessionCookiePolicy(options, keepSignedIn));
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const isApi = pathname.startsWith("/api/");

  if (!user) {
    if (isApi) return response; // API routes enforce their own auth
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Idle rule — only for sessions without "Keep me signed in".
  if (!keepSignedIn) {
    const lastActive = Number(request.cookies.get(LAST_ACTIVE_COOKIE)?.value);
    if (isIdleExpired(lastActive, Date.now(), IDLE_MINUTES)) {
      await supabase.auth.signOut({ scope: "local" });
      if (isApi) {
        const expired = NextResponse.json(
          { error: { code: "UNAUTHENTICATED", message: "Signed out after 30 minutes of inactivity." } },
          { status: 401 },
        );
        for (const c of response.cookies.getAll()) expired.cookies.set(c);
        expired.cookies.delete(LAST_ACTIVE_COOKIE);
        return expired;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "?reason=idle";
      const redirect = NextResponse.redirect(url);
      redirect.cookies.delete(LAST_ACTIVE_COOKIE);
      return redirect;
    }
    response.cookies.set(LAST_ACTIVE_COOKIE, String(Date.now()), markerCookie(false));
  }

  if (isApi || isPublic(pathname)) return response;

  // RLS returns the profile only for an active user (FR-015).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, setup_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/signed-out";
    url.search = "?reason=inactive";
    return NextResponse.redirect(url);
  }

  if (!profile.setup_completed_at && pathname !== "/setup") {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && profile.role !== "owner") {
    return NextResponse.rewrite(new URL("/forbidden", request.url), { status: 403 });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
