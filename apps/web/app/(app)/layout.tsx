import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IdleWarning } from "@/components/IdleWarning";
import { DisplayProvider } from "@/components/providers/DisplayProvider";
import { getPreferences } from "@ft/db";
import { checkEnvironment } from "@/lib/environment-guard";
import { publicEnv } from "@/lib/env";
import { KEEP_SIGNED_IN_COOKIE } from "@/lib/session-cookies";
import { createServerSupabase } from "@/lib/supabase/server";

const IDLE_MINUTES = Number(process.env.IDLE_MINUTES ?? 30);

/**
 * Signed-in frame (T037). The full navigation shell arrives with US5 (T100); this layout already
 * enforces the environment guard (FR-019a), provides display settings to every screen, and shows
 * the idle warning for sessions not kept signed in (FR-010).
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const env = await checkEnvironment();
  if (env === "mismatch") redirect("/config-error");
  if (env === "unavailable") redirect("/unavailable");

  const keepSignedIn = (await cookies()).get(KEEP_SIGNED_IN_COOKIE)?.value === "1";

  // T082: saved preferences drive every amount and date on every screen (FR-023, FR-025).
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const preferences = data.user ? await getPreferences(supabase, data.user.id) : null;

  return (
    <DisplayProvider preferences={preferences ?? undefined}>
      <div className="flex min-h-full flex-1 flex-col">
        {publicEnv.appEnv === "demo" && (
          <div role="status" aria-label="Demo environment" className="bg-demo px-4 py-1 text-center text-xs font-medium text-white">
            Demo environment — synthetic data only
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
        {!keepSignedIn && <IdleWarning idleMinutes={IDLE_MINUTES} />}
      </div>
    </DisplayProvider>
  );
}
