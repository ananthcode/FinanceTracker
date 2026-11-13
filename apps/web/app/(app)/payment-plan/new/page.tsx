import Link from "next/link";
import { DEFAULT_PREFERENCES, monthOf, parseMonthParam, todayInZone } from "@ft/core";
import { getPreferences, listAccounts, listCategories, listPayees } from "@ft/db";
import { ItemForm } from "@/components/plan/ItemForm";
import { createServerSupabase } from "@/lib/supabase/server";

/** Add a planned payment (R7 US2 1, 3; FR-005, FR-007). It starts in the month being viewed. */
export default async function NewPlanItemPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const currentMonth = monthOf(todayInZone(prefs.timezone));
  const viewed = parseMonthParam(month) ?? currentMonth;
  const [accounts, payees, categories] = await Promise.all([listAccounts(supabase), listPayees(supabase), listCategories(supabase)]);
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href={`/payment-plan?month=${viewed.slice(0, 7)}`} className="text-sm text-brand-strong underline dark:text-brand">
        Back to the payment plan
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Add a planned payment
      </h1>
      <ItemForm
        item={null}
        viewedMonth={viewed}
        currentMonth={currentMonth}
        accounts={accounts}
        payees={payees}
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        currency={prefs.baseCurrency}
        paidMonths={0}
      />
    </section>
  );
}
