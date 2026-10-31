import Link from "next/link";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPreferences, listAccounts, listCategories, listPayees, listTags } from "@ft/db";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeReturn } from "@/lib/transactions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// "interest" is recorded by hand from a person's page (FR-015).
const TYPES = ["expense", "income", "refund", "transfer", "person", "interest"] as const;

/** Add a transaction (R4 US1–US3, US5). `?type=`, `?account=` and `?payee=` preselect; `?returnTo=` comes back. */
export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [accounts, payees, categories, tags, preferences] = await Promise.all([
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const returnTo = safeReturn(params.returnTo, "/transactions");
  const type = TYPES.find((t) => t === params.type);
  const accountId = typeof params.account === "string" && UUID.test(params.account) ? params.account : null;
  const payeeId = typeof params.payee === "string" && UUID.test(params.payee) ? params.payee : null;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href={returnTo} className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Back
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Add transaction
      </h1>
      <TransactionForm
        mode={{ type: "create", kind: type, accountId, payeeId }}
        accounts={accounts}
        payees={payees}
        categories={categories}
        tags={tags}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayInZone(prefs.timezone)}
        currency={prefs.baseCurrency}
        returnTo={returnTo}
      />
    </section>
  );
}
