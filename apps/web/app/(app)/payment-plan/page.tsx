import Link from "next/link";
import { categoryPath, DEFAULT_PREFERENCES, indexCategories, monthOf, parseMonthParam, todayInZone } from "@ft/core";
import { getPreferences, listCategories, listPayees } from "@ft/db";
import type { PlanNames } from "@/components/plan/labels";
import { MonthNav, PlanMonth } from "@/components/plan/PlanMonth";
import { RowActions } from "@/components/plan/RowActions";
import { buttonVariants } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { loadPlan } from "@/lib/plan-data";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Payment plan (R7 US1; FR-001 – FR-004, FR-022): one month at a time — this month by default — with
 * every planned payment, its status in words and exact totals. Replaces the R1 placeholder. Reads
 * with the user's own client (RLS); every number comes from core's planMonth.
 */
export default async function PaymentPlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: param } = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const requested = parseMonthParam(param) ?? monthOf(todayInZone(prefs.timezone));
  const [plan, payees, categories] = await Promise.all([loadPlan(supabase, prefs, [requested]), listPayees(supabase), listCategories(supabase)]);
  const month = plan.months[0]!;
  const view = plan.views.get(month)!;
  const currency = prefs.baseCurrency;

  if (plan.items.length === 0) {
    return (
      <section aria-labelledby="page-title" className="flex max-w-prose flex-col gap-4">
        <h1 id="page-title" className="text-2xl font-semibold">
          Payment plan
        </h1>
        <p className="text-muted-foreground">
          Plan the payments you make every month — EMIs, rent, card bills, school fees, subscriptions, money you repay
          people — once. Each month then shows what is planned, what is paid and what is still to pay, so nothing is missed
          and nothing is recorded twice.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/payment-plan/new?month=${month.slice(0, 7)}`} className={buttonVariants()}>
            Add a planned payment
          </Link>
          {publicEnv.appEnv === "demo" && (
            <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
              Load demo data
            </Link>
          )}
        </div>
      </section>
    );
  }

  const accounts = new Map(plan.accounts.map((a) => [a.id, a.name]));
  const payeeNames = new Map(payees.map((p) => [p.id, p.name]));
  const index = indexCategories(categories);
  const names: PlanNames = {
    account: (id) => (id ? (accounts.get(id) ?? "Removed account") : "No account"),
    payee: (id) => (id ? (payeeNames.get(id) ?? "Removed payee") : ""),
    category: (id) => (id && index.has(id) ? categoryPath(id, index) : null),
  };
  const items = new Map(plan.items.map((i) => [i.id, i]));

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="page-title" className="text-2xl font-semibold">
          Payment plan
        </h1>
        <Link href={`/payment-plan/new?month=${month.slice(0, 7)}`} className={buttonVariants()}>
          Add a planned payment
        </Link>
      </div>
      <MonthNav month={month} earliest={plan.earliest} latest={plan.latest} />
      <PlanMonth
        view={view}
        items={items}
        names={names}
        currency={currency}
        rowActions={(row) => {
          const item = items.get(row.itemId)!;
          if (row.removed) return null;
          return (
            <RowActions
              itemId={row.itemId}
              name={row.name}
              month={row.month}
              plannedMinor={row.plannedMinor}
              skipped={row.status === "skipped"}
              oneOff={item.frequency === "one_off"}
              endMonth={item.endMonth}
              currency={currency}
            />
          );
        }}
      />
    </section>
  );
}
