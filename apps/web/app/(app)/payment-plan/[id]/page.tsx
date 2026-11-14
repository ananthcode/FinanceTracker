import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, isCountedLink, monthOf, parseMonthParam, todayInZone } from "@ft/core";
import { getPlanItem, getPreferences, listAccounts, listCategories, listPayees, planLinks } from "@ft/db";
import { ItemForm } from "@/components/plan/ItemForm";
import { createServerSupabase } from "@/lib/supabase/server";

/** Edit a planned payment (R7 US2 4, 5; FR-008): changes apply from the month being viewed onward. */
export default async function EditPlanItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ id }, { month }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const currentMonth = monthOf(todayInZone(prefs.timezone));
  const viewed = parseMonthParam(month) ?? currentMonth;
  const [item, accounts, payees, categories, links] = await Promise.all([
    getPlanItem(supabase, id),
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    planLinks(supabase, "9999-12-01"),
  ]);
  if (!item || item.state === "deleted") notFound();
  const paidMonths = new Set(links.filter((l) => l.planItemId === id && isCountedLink(l)).map((l) => l.planMonth)).size;
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href={`/payment-plan?month=${viewed.slice(0, 7)}`} className="text-sm text-brand-strong underline dark:text-brand">
        Back to the payment plan
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Edit {item.name}
      </h1>
      <ItemForm
        item={item}
        viewedMonth={viewed}
        currentMonth={currentMonth}
        accounts={accounts}
        payees={payees}
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        currency={prefs.baseCurrency}
        paidMonths={paidMonths}
      />
    </section>
  );
}
