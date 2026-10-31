import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, isCounted, personBalanceOf, runningPersonBalances, todayInZone } from "@ft/core";
import {
  balanceMovements,
  getPayee,
  getPreferences,
  listAccounts,
  listCategories,
  listPayees,
  listTags,
  searchTransactions,
} from "@ft/db";
import { PayeeForm } from "@/components/lists/PayeeForm";
import { PayeeManage } from "@/components/lists/PayeeManage";
import { PersonBalance } from "@/components/lists/PersonBalance";
import { PersonMovements } from "@/components/transactions/PersonMovements";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { namesOf } from "@/lib/transactions";

/**
 * Edit person (R3 US3; FR-016 – FR-020) and their movements with the balance after each (R4 FR-008,
 * FR-011). A business opened here is shown on the payee page instead.
 */
export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [person, categories, payees, preferences, totals, accounts, tags] = await Promise.all([
    getPayee(supabase, id),
    listCategories(supabase),
    listPayees(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
    balanceMovements(supabase),
    listAccounts(supabase),
    listTags(supabase),
  ]);
  if (!person || person.kind !== "person") notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(prefs.timezone);
  const balance = personBalanceOf(person, totals.people);
  // The latest 50 movements; the full history is in Transactions filtered by this person.
  const page = await searchTransactions(supabase, { payeeId: person.id }, null, 50);
  const after = runningPersonBalances(page.rows, person.id, balance);
  const rows = page.rows.map((tx, i) => ({ tx, balanceAfter: after[i]!, counted: isCounted(tx) }));
  const returnTo = `/people/${person.id}`;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/people" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← People
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        {person.name}
      </h1>
      <p>
        Balance: <PersonBalance balance={balance} className="font-medium" />
      </p>

      <section aria-labelledby="person-movements" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="person-movements" className="mr-auto text-lg font-semibold">
            Movements
          </h2>
          <Link
            href={`/transactions/new?type=person&payee=${person.id}&returnTo=${encodeURIComponent(returnTo)}`}
            className={buttonVariants({ size: "sm" })}
          >
            Record a movement
          </Link>
          {page.count > rows.length && (
            <Link href={`/transactions?payee=${person.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              See all {page.count} in Transactions
            </Link>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No movements yet. Lending, repaying and paying on their behalf appear here.</p>
        ) : (
          <PersonMovements rows={rows} names={namesOf(accounts, payees, categories, tags)} todayIso={todayIso} returnTo={returnTo} />
        )}
      </section>

      <h2 className="border-t border-border pt-4 text-lg font-semibold">Details</h2>
      <PayeeForm
        key={person.id}
        mode={{ type: "edit", payee: person }}
        fixedKind="person"
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayIso}
        payees={payees.filter((p) => p.id !== person.id).map((p) => ({ id: p.id, name: p.name }))}
        returnTo="/people"
      />
      <PayeeManage payee={person} payees={payees} returnTo="/people" />
    </section>
  );
}
