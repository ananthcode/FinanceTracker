import { DateText } from "@/components/DateText";
import { createServerSupabase } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

const LABELS: Record<string, string> = {
  sign_in_succeeded: "Signed in",
  sign_in_failed: "Failed sign-in attempt",
  sign_in_locked: "Sign-in locked for 15 minutes",
  signed_out: "Signed out",
};

/**
 * Settings (US2 part): your own sign-in activity (FR-039) and sign-out (FR-011).
 * Preferences arrive with US3 (T085) and app lock (Android) with US6.
 */
export default async function SettingsPage() {
  const supabase = await createServerSupabase();
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

      <section aria-labelledby="activity-title" className="flex flex-col gap-2">
        <h2 id="activity-title" className="text-lg font-medium">
          Recent sign-in activity
        </h2>
        {data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
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
          <p className="text-sm text-muted">No activity yet.</p>
        )}
      </section>

      <SignOutButton />
    </section>
  );
}
