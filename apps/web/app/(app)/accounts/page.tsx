import Link from "next/link";
import { ACCOUNT_TYPE_GROUP_TITLE, summarise } from "@ft/core";
import { listAccounts, listGroups } from "@ft/db";
import { AccountRow } from "@/components/accounts/AccountRow";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Accounts (R2 US1): the user's accounts grouped by type, each with its exact balance (FR-009,
 * FR-012, FR-015). Reads through the user's own client — row-level security returns only their rows.
 */
export default async function AccountsPage() {
  const supabase = await createServerSupabase();
  const [accounts, groups] = await Promise.all([listAccounts(supabase), listGroups(supabase)]);
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

      {summary.sections.map((section) => {
        const title = section.type ? ACCOUNT_TYPE_GROUP_TITLE[section.type] : (section.group?.name ?? "Ungrouped");
        const headingId = `group-${section.key}`;
        return (
          <section key={section.key} aria-labelledby={headingId} className="flex flex-col">
            <h2 id={headingId} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {title}
            </h2>
            <ul className="mt-1">
              {section.rows.map((row) => (
                <AccountRow key={row.account.id} row={row} />
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
