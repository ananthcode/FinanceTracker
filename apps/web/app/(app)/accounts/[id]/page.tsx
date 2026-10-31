import Link from "next/link";
import { notFound } from "next/navigation";
import { currentBalance, DEFAULT_PREFERENCES, movementsFromTotals, todayInZone } from "@ft/core";
import {
  balanceMovements,
  getAccount,
  getPreferences,
  listAccounts,
  listCategories,
  listGroups,
  listPayees,
  listTags,
  searchTransactions,
} from "@ft/db";
import { AccountActions } from "@/components/accounts/AccountActions";
import { AccountForm } from "@/components/accounts/AccountForm";
import { TransactionList } from "@/components/transactions/TransactionList";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { namesOf } from "@/lib/transactions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edit, archive, restore or delete an account (R2 US3–US4; FR-011, FR-021–FR-024), and its latest
 * transactions (R4 contracts/client-transactions.md). Only the caller's own, non-deleted accounts
 * are found (RLS).
 */
export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const filters = { accountId: id };
  const [account, accounts, groups, preferences, totals, page, payees, categories, tags] = await Promise.all([
    getAccount(supabase, id),
    listAccounts(supabase),
    listGroups(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
    balanceMovements(supabase),
    searchTransactions(supabase, filters, null, 50),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
  ]);
  if (!account) notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(prefs.timezone);
  const balance = currentBalance(account, movementsFromTotals([account], totals.accounts));
  const returnTo = `/accounts/${account.id}`;

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
        todayIso={todayIso}
        currency={account.currency}
      />
      <AccountActions account={account} balance={balance} />

      <section aria-labelledby="account-transactions" className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="account-transactions" className="mr-auto text-lg font-semibold">
            Transactions
          </h2>
          {account.state === "active" && (
            <Link href={`/transactions/new?account=${account.id}&returnTo=${encodeURIComponent(returnTo)}`} className={buttonVariants({ size: "sm" })}>
              Add transaction
            </Link>
          )}
          {page.count > 0 && (
            <Link href={`/transactions?account=${account.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              See all in Transactions
            </Link>
          )}
        </div>
        {page.count === 0 ? (
          <p className="text-muted-foreground">No transactions yet.</p>
        ) : (
          <TransactionList
            initial={page}
            filters={filters}
            names={namesOf(accounts, payees, categories, tags)}
            todayIso={todayIso}
            returnTo={returnTo}
            label={`${account.name} transactions`}
          />
        )}
      </section>
    </section>
  );
}
