import { redirect } from "next/navigation";
import { DEFAULT_PREFERENCES } from "@ft/core";
import { getPreferences, getProfile } from "@ft/db";
import { PreferencesForm } from "@/components/PreferencesForm";
import { createServerSupabase } from "@/lib/supabase/server";

/** First-run setup (US3, FR-020): required before any other screen. */
export default async function SetupPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");
  const [profile, preferences] = await Promise.all([
    getProfile(supabase, data.user.id),
    getPreferences(supabase, data.user.id),
  ]);
  if (profile?.setupComplete) redirect("/");

  return (
    <section aria-labelledby="setup-title" className="flex flex-col gap-4">
      <h1 id="setup-title" className="text-2xl font-semibold">
        Set up your account
      </h1>
      <p className="text-sm text-muted-foreground">
        These choices decide how amounts and dates appear everywhere. You can change everything except the base
        currency later in Settings.
      </p>
      <PreferencesForm
        mode="setup"
        initial={preferences ?? DEFAULT_PREFERENCES}
        initialDisplayName={profile?.displayName ?? ""}
        needsPrivacyNotice={!profile?.privacyNoticeShown}
        nowIso={new Date().toISOString()}
      />
    </section>
  );
}
