import "server-only";
import { cookies } from "next/headers";
import { createWebServerClient } from "@ft/db";
import { publicEnv } from "@/lib/env";
import { applySessionCookiePolicy, KEEP_SIGNED_IN_COOKIE } from "@/lib/session-cookies";

/**
 * Supabase client acting as the signed-in web user (auth cookies). Cookie writes follow the
 * "Keep me signed in" policy (FR-010, research R-08).
 */
export async function createServerSupabase() {
  const store = await cookies();
  const keepSignedIn = store.get(KEEP_SIGNED_IN_COOKIE)?.value === "1";
  return createWebServerClient(
    { url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey },
    {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, applySessionCookiePolicy(options, keepSignedIn));
          }
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes them.
        }
      },
    },
  );
}
