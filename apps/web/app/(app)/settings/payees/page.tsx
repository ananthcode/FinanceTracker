import Link from "next/link";
import { balanceMovements, listCategories, listPayees } from "@ft/db";
import { PayeeList } from "@/components/lists/PayeeList";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

/** Settings › Payees (R3 US2; FR-012 – FR-015). */
export default async function PayeesPage() {
  const supabase = await createServerSupabase();
  const [payees, categories, totals] = await Promise.all([listPayees(supabase), listCategories(supabase), balanceMovements(supabase)]);

  return (
    <section aria-labelledby="page-title" className="flex max-w-2xl flex-col gap-4">
      <Link href="/settings" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Settings
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="page-title" className="mr-auto text-2xl font-semibold">
          Payees
        </h1>
        <Link href="/settings/payees/new" className={buttonVariants()}>
          Add payee
        </Link>
      </div>
      <p className="text-muted-foreground">
        The businesses and people you pay or are paid by. A default category is filled in when you choose the payee for
        a transaction.
      </p>
      <PayeeList payees={payees} categories={categories} movements={totals.people} />
    </section>
  );
}
