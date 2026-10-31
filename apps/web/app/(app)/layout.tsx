import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IdleWarning } from "@/components/IdleWarning";
import { DisplayProvider } from "@/components/providers/DisplayProvider";
import { AppShell } from "@/components/shell/AppShell";
import { DemoBadge } from "@/components/shell/DemoBadge";
import { HideBalancesToggle } from "@/components/shell/HideBalancesToggle";
import { getPreferences, getProfile, toConfirmCount } from "@ft/db";
import { checkEnvironment } from "@/lib/environment-guard";
import { publicEnv } from "@/lib/env";
import { KEEP_SIGNED_IN_COOKIE } from "@/lib/session-cookies";
import { createServerSupabase } from "@/lib/supabase/server";

const IDLE_MINUTES = Number(process.env.IDLE_MINUTES ?? 30);

/**
 * Signed-in frame (T037, T100): enforces the environment guard (FR-019a), provides display
 * settings to every screen, shows the Demo marker (FR-035) and the navigation shell (FR-034) once
 * setup is complete, and the idle warning for sessions not kept signed in (FR-010).
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const env = await checkEnvironment();
  if (env === "mismatch") redirect("/config-error");
  if (env === "unavailable") redirect("/unavailable");

  const keepSignedIn = (await cookies()).get(KEEP_SIGNED_IN_COOKIE)?.value === "1";

  // T082: saved preferences drive every amount and date on every screen (FR-023, FR-025).
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [profile, preferences] = data.user
    ? await Promise.all([getProfile(supabase, data.user.id), getPreferences(supabase, data.user.id)])
    : [null, null];
  // R4 FR-002a: "N to confirm" on the Transactions entry. A failed count only hides the badge.
  const toConfirm = profile?.setupComplete ? await toConfirmCount(supabase).catch(() => 0) : 0;

  return (
    <DisplayProvider preferences={preferences ?? undefined}>
      <div className="flex min-h-full flex-1 flex-col">
        {publicEnv.appEnv === "demo" && <DemoBadge />}
        {profile?.setupComplete ? (
          <AppShell isOwner={profile.role === "owner"} actions={<HideBalancesToggle />} badges={{ "/transactions": toConfirm }}>
            {children}
          </AppShell>
        ) : (
          // First-run setup: no navigation until it is done (FR-020).
          <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
        )}
        {!keepSignedIn && <IdleWarning idleMinutes={IDLE_MINUTES} />}
      </div>
    </DisplayProvider>
  );
}
