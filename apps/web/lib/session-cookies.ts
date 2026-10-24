import type { CookieOptions } from "@supabase/ssr";

/** Remembers the user's "Keep me signed in" choice on this browser (FR-010, research R-08). */
export const KEEP_SIGNED_IN_COOKIE = "ft_keep";
/** Last activity time (epoch ms) for the 30-minute idle rule when not kept signed in. */
export const LAST_ACTIVE_COOKIE = "ft_last_active";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Hardens every auth cookie (FR-036b) and applies the keep-signed-in policy:
 * kept → persistent cookie; not kept → session cookie (no Max-Age/Expires), ends with the browser.
 */
export function applySessionCookiePolicy(options: CookieOptions | undefined, keepSignedIn: boolean): CookieOptions {
  const hardened: CookieOptions = {
    ...options,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
  };
  if (!keepSignedIn) {
    delete hardened.maxAge;
    delete hardened.expires;
  }
  return hardened;
}

/** Options for the app's own marker cookies. */
export function markerCookie(keepSignedIn: boolean): CookieOptions {
  return applySessionCookiePolicy(keepSignedIn ? { maxAge: 60 * 60 * 24 * 400 } : {}, keepSignedIn);
}

/** True when an unkept session has been idle for longer than `idleMinutes`. */
export function isIdleExpired(lastActiveMs: number | undefined, nowMs: number, idleMinutes: number): boolean {
  if (lastActiveMs === undefined || Number.isNaN(lastActiveMs)) return false;
  return nowMs - lastActiveMs > idleMinutes * 60_000;
}
