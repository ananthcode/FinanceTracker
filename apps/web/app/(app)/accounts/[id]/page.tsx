import { notFound } from "next/navigation";
import { currentBalance, DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getAccount, getPreferences, listAccounts, listGroups } from "@ft/db";
import { AccountActions } from "@/components/accounts/AccountActions";
import { AccountForm } from "@/components/accounts/AccountForm";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Edit, archive, restore or delete an account (R2 US3–US4; FR-011, FR-021–FR-024). Only the caller's own, non-deleted accounts are found (RLS). */
export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [account, accounts, groups, preferences] = await Promise.all([
    getAccount(supabase, id),
    listAccounts(supabase),
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
      <AccountForm
        mode="edit"
        account={account}
        groups={groups}
        archived={accounts.filter((a) => a.state === "archived" && a.id !== account.id).map((a) => ({ id: a.id, name: a.name }))}
        todayIso={todayInZone(prefs.timezone)}
        currency={account.currency}
      />
      <AccountActions account={account} balance={currentBalance(account)} />
    </section>
  );
}
