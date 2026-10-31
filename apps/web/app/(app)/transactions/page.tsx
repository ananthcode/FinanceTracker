import Link from "next/link";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPreferences, listAccounts, listCategories, listPayees, listTags, runInterestProposals, searchTransactions } from "@ft/db";
import { ToConfirm } from "@/components/transactions/ToConfirm";
import { TransactionList } from "@/components/transactions/TransactionList";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { filtersFromParams, namesOf } from "@/lib/transactions";

/**
 * Transactions (R4 US1; FR-002a, FR-017): "To confirm" first (due upcoming entries and interest
 * proposals), then every transaction newest first with "Load more". Filters arrive in the URL.
 * Reads through the user's own client — row-level security returns only their rows.
 */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = filtersFromParams(params);
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const preferences = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(preferences.timezone);
  // Proposals follow edits made since the layout last ran (it does not re-render on navigation).
  await runInterestProposals(supabase).catch(() => 0);
  const [page, toConfirm, accounts, payees, categories, tags] = await Promise.all([
    searchTransactions(supabase, filters, null, 50),
    searchTransactions(supabase, { upcoming: true, to: todayIso, statuses: ["uncleared", "cleared", "follow_up"] }, null, 200),
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
  ]);
  const names = namesOf(accounts, payees, categories, tags);
  const filtered = Object.keys(filters).length > 0;
  const returnTo = "/transactions";

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="page-title" className="text-2xl font-semibold">
          Transactions
        </h1>
        <Link href="/transactions/new" className={buttonVariants()}>
          Add transaction
        </Link>
      </div>

      {toConfirm.rows.length > 0 && <ToConfirm rows={toConfirm.rows} names={names} todayIso={todayIso} />}

      {filtered && (
        <p className="text-sm">
          Showing matching transactions.{" "}
          <Link href="/transactions" className="text-brand-strong underline dark:text-brand">
            Show all
          </Link>
        </p>
      )}

      {page.count === 0 && !filtered ? (
        <div className="flex max-w-prose flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6">
          <h2 className="text-lg font-medium">No transactions yet</h2>
          <p className="text-muted-foreground">
            Record what you spend and earn, money moved between your accounts, and money lent to or borrowed from people. Your
            balances update as you go.
          </p>
          <Link href="/transactions/new" className={buttonVariants()}>
            Add transaction
          </Link>
        </div>
      ) : (
        <TransactionList initial={page} filters={filters} names={names} todayIso={todayIso} returnTo={returnTo} />
      )}
    </section>
  );
}
