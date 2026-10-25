import { DEFAULT_PREFERENCES, keyBetween, todayInZone } from "@ft/core";
import { getPreferences, listAccounts } from "@ft/db";
import { AccountForm } from "@/components/accounts/AccountForm";
import { createServerSupabase } from "@/lib/supabase/server";

/** Add account (R2 US1, FR-001). New accounts go to the end of the user's order (FR-010). */
export default async function NewAccountPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [accounts, preferences] = await Promise.all([
    listAccounts(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const lastKey = accounts.reduce<string | null>((max, a) => (max === null || a.sortKey > max ? a.sortKey : max), null);

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Add account
      </h1>
      <AccountForm todayIso={todayInZone(prefs.timezone)} currency={prefs.baseCurrency} nextSortKey={keyBetween(lastKey, null)} />
    </section>
  );
}
