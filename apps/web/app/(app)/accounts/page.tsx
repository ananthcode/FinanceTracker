import Link from "next/link";
import { DEFAULT_PREFERENCES, summarise } from "@ft/core";
import { getPreferences, listAccounts, listGroups } from "@ft/db";
import { GroupSection } from "@/components/accounts/GroupSection";
import { NetWorthSummary } from "@/components/accounts/NetWorthSummary";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Accounts (R2 US1–US2): the net-worth summary and the user's accounts grouped by type, each with
 * its exact balance and every group with its subtotal (FR-009, FR-012–FR-018). All figures come
 * from summarise() so later screens show the same numbers (FR-019). Reads through the user's own
 * client — row-level security returns only their rows.
 */
export default async function AccountsPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [accounts, groups, preferences] = await Promise.all([
    listAccounts(supabase),
    listGroups(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  const currency = (preferences ?? DEFAULT_PREFERENCES).baseCurrency;
  const summary = summarise(accounts, { view: "by_type", groups });
  const hasActive = summary.sections.length > 0;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="page-title" className="text-2xl font-semibold">
          Accounts
        </h1>
        {hasActive && (
          <Link href="/accounts/new" className={buttonVariants()}>
            Add account
          </Link>
        )}
      </div>

      {!hasActive && (
        <div className="flex max-w-prose flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6">
          <h2 className="text-lg font-medium">No accounts yet</h2>
          <p className="text-muted-foreground">
            An account is a place where your money is kept or owed — a bank account, cash in hand, a wallet, or a
            credit card. Add each one with the balance it had on a date you choose; every amount you record later
            belongs to one of them.
          </p>
          <Link href="/accounts/new" className={buttonVariants()}>
            Add account
          </Link>
        </div>
      )}

      {accounts.length > 0 && <NetWorthSummary summary={summary} currency={currency} />}

      {summary.sections.map((section) => (
        <GroupSection key={section.key} section={section} currency={currency} />
      ))}
    </section>
  );
}
