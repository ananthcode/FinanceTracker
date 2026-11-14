import Link from "next/link";
import { DEFAULT_PREFERENCES } from "@ft/core";
import { todayInZone } from "@ft/core";
import { attachmentUsage, getPreferences, getProfile, hasNoData, myOpenImport } from "@ft/db";
import { DateText } from "@/components/DateText";
import { PreferencesForm } from "@/components/PreferencesForm";
import { ExportData } from "@/components/settings/ExportData";
import { ImportBackup } from "@/components/settings/ImportBackup";
import { YourData } from "@/components/settings/YourData";
import { publicEnv } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

const LABELS: Record<string, string> = {
  sign_in_succeeded: "Signed in",
  sign_in_failed: "Failed sign-in attempt",
  sign_in_locked: "Sign-in locked for 15 minutes",
  signed_out: "Signed out",
};

/**
 * Settings: preferences with live preview (US3, FR-022–FR-024), your own sign-in activity (FR-039)
 * your data — demo data and reset (R5) — and sign-out (FR-011). App lock (Android) arrives with US6.
 */
export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? "";
  const [profile, preferences, empty, usage, openImport] = await Promise.all([
    getProfile(supabase, userId),
    getPreferences(supabase, userId),
    hasNoData(supabase),
    attachmentUsage(supabase).catch(() => null),
    myOpenImport(supabase).catch(() => null),
  ]);
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const { data } = await supabase
    .from("audit_events")
    .select("id, occurred_at, action, device_type, details")
    .in("action", Object.keys(LABELS))
    .order("occurred_at", { ascending: false })
    .limit(20);

  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-6">
      <h1 id="settings-title" className="text-2xl font-semibold">
        Settings
      </h1>

      <section aria-labelledby="preferences-title" className="flex flex-col gap-2">
        <h2 id="preferences-title" className="text-lg font-medium">
          Preferences
        </h2>
        <PreferencesForm
          mode="settings"
          initial={preferences ?? DEFAULT_PREFERENCES}
          initialDisplayName={profile?.displayName ?? ""}
          nowIso={new Date().toISOString()}
        />
      </section>

      <section aria-labelledby="lists-title" className="flex flex-col gap-2">
        <h2 id="lists-title" className="text-lg font-medium">
          Lists
        </h2>
        <ul className="flex flex-col gap-1">
          <li>
            <Link href="/settings/categories" className="text-brand-strong hover:underline dark:text-brand">
              Categories
            </Link>
          </li>
          <li>
            <Link href="/settings/payees" className="text-brand-strong hover:underline dark:text-brand">
              Payees
            </Link>
          </li>
          <li>
            <Link href="/settings/tags" className="text-brand-strong hover:underline dark:text-brand">
              Tags
            </Link>
          </li>
        </ul>
      </section>

      <YourData
        empty={empty}
        demoAvailable={publicEnv.appEnv === "demo"}
        usage={usage && { files: usage.files, bytes: usage.bytes.toString(), allowance: usage.allowance.toString() }}
      />

      {/* R10: export and import a backup. */}
      <section aria-labelledby="export-import-title" className="flex flex-col gap-3">
        <h2 id="export-import-title" className="text-lg font-medium">
          Export and import
        </h2>
        <ExportData
          today={todayInZone(prefs.timezone)}
          fyStartMonth={prefs.fyStartMonth}
          numberFormat={prefs.numberFormat}
          usage={usage && { files: usage.files, bytes: usage.bytes.toString() }}
        />
        <ImportBackup empty={empty} baseCurrency={prefs.baseCurrency} openImport={openImport} />
      </section>

      <section aria-labelledby="activity-title" className="flex flex-col gap-2">
        <h2 id="activity-title" className="text-lg font-medium">
          Recent sign-in activity
        </h2>
        {data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1">When</th>
                <th scope="col">What</th>
                <th scope="col">Method</th>
                <th scope="col">Device</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id as number} className="border-t border-border">
                  <td className="py-1">
                    <DateText instant={row.occurred_at as string} />
                  </td>
                  <td>{LABELS[row.action as string]}</td>
                  <td>{(row.details as { method?: string } | null)?.method ?? "—"}</td>
                  <td>{(row.device_type as string | null) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </section>

      <SignOutButton />
    </section>
  );
}
