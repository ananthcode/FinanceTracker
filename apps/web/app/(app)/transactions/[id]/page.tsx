import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPreferences, getTransaction, listAccounts, listCategories, listPayees, listTags } from "@ft/db";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeReturn } from "@/lib/transactions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Edit, confirm or delete a transaction (R4 FR-020, FR-002a). Only the caller's own, non-deleted ones are found (RLS). */
export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [transaction, accounts, payees, categories, tags, preferences] = await Promise.all([
    getTransaction(supabase, id),
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  if (!transaction) notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const returnTo = safeReturn(query.returnTo, "/transactions");

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href={returnTo} className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Back
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Edit transaction
      </h1>
      <TransactionForm
        key={transaction.id}
        mode={{ type: "edit", transaction }}
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
