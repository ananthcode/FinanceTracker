import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getAccount, getPreferences, listGroups } from "@ft/db";
import { AccountForm } from "@/components/accounts/AccountForm";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Edit account (R2 US3; FR-011). Only the caller's own, non-deleted accounts are found (RLS). */
export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [account, groups, preferences] = await Promise.all([
    getAccount(supabase, id),
    listGroups(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  if (!account) notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Edit account
      </h1>
      <AccountForm mode="edit" account={account} groups={groups} todayIso={todayInZone(prefs.timezone)} currency={account.currency} />
    </section>
  );
}
