import Link from "next/link";
import { compareNames, DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPreferences, listAccounts, listCategories, listPayees, listTags, runInterestProposals, searchTransactions } from "@ft/db";
import { QuickAdd } from "@/components/templates/QuickAdd";
import { FilterPanel } from "@/components/transactions/FilterPanel";
import { ToConfirm } from "@/components/transactions/ToConfirm";
import { TransactionList } from "@/components/transactions/TransactionList";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadQuickAdd } from "@/lib/templates-data";
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
  const [page, toConfirm, accounts, payees, categories, tags, quick] = await Promise.all([
    searchTransactions(supabase, filters, null, 50),
    searchTransactions(supabase, { upcoming: true, to: todayIso, statuses: ["uncleared", "cleared", "follow_up"] }, null, 200),
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    loadQuickAdd(supabase, preferences),
  ]);
  const names = namesOf(accounts, payees, categories, tags);
  const filtered = Object.keys(filters).length > 0;
  const returnTo = "/transactions";
  const byPath = (a: [string, string], b: [string, string]) => compareNames(a[1], b[1]);
  const categoryPaths = categories.map((c): [string, string] => [c.id, names.categories[c.id]!]).sort(byPath);
  const visiblePaths = categories.filter((c) => !c.hidden).map((c): [string, string] => [c.id, names.categories[c.id]!]).sort(byPath);

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

      {/* R8: Quick add (US1, US3). */}
      <section id="quick-add" aria-labelledby="quick-add-title" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="quick-add-title" className="text-lg font-semibold">
            Quick add
          </h2>
          <Link href="/templates" className="text-sm text-brand-strong underline dark:text-brand">
            Manage templates
          </Link>
        </div>
        {quick.templates.length > 0 ? (
          <QuickAdd templates={quick.templates} info={quick.info} today={quick.today} currency={preferences.baseCurrency} returnTo={returnTo} />
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
            <p className="text-muted-foreground">
              A template records something you pay often — milk, fuel, a wallet top-up — in one tap, with its account, payee and
              category filled in.
            </p>
            <Link href="/templates/new" className={buttonVariants({ size: "sm" })}>
              Make a template
            </Link>
          </div>
        )}
      </section>

      {toConfirm.rows.length > 0 && <ToConfirm rows={toConfirm.rows} names={names} todayIso={todayIso} />}

      {(page.count > 0 || filtered) && (
        <FilterPanel
          key={JSON.stringify(filters)}
          filters={filters}
          accounts={accounts}
          categoryPaths={categoryPaths}
          payees={payees}
          tags={tags}
          currency={preferences.baseCurrency}
        />
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
        <TransactionList
          initial={page}
          filters={filters}
          names={names}
          todayIso={todayIso}
          returnTo={returnTo}
          bulk={{ categoryPaths: visiblePaths, categories, payees, tags }}
        />
      )}
    </section>
  );
}
