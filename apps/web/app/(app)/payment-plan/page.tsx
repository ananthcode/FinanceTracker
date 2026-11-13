import Link from "next/link";
import {
  categoryPath,
  DEFAULT_PREFERENCES,
  indexCategories,
  monthOf,
  parseMonthParam,
  peopleTotals,
  personBalanceOf,
  todayInZone,
  withLikely,
  type PlanMonthView,
  type TransactionView,
} from "@ft/core";
import { getPreferences, listCategories, listPayees, planCandidates } from "@ft/db";
import { Comparison } from "@/components/plan/Comparison";
import type { PlanNames } from "@/components/plan/labels";
import { PayActions } from "@/components/plan/PayActions";
import { PeopleOwed } from "@/components/plan/PeopleOwed";
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
  const currency = prefs.baseCurrency;
  const items = new Map(plan.items.map((i) => [i.id, i]));

  // "Looks paid — link?" (FR-013): unlinked payments near an unpaid item-month. Suggestions only.
  let view: PlanMonthView = plan.views.get(month)!;
  const likelyTx = new Map<string, TransactionView>();
  const unpaid = [...view.rows, ...view.carried].filter((r) => r.leftMinor > 0n && r.status !== "skipped" && !r.removed);
  if (unpaid.length > 0) {
    const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const dues = unpaid.map((r) => r.dueDate).sort();
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const last = dues.at(-1)! > monthEnd ? dues.at(-1)! : monthEnd;
    const targets = unpaid.map((r) => items.get(r.itemId)!);
    const candidates = await planCandidates(
      supabase,
      shift(dues[0]!, -10),
      shift(last, 10),
      [...new Set(targets.flatMap((i) => (i.payeeId ? [i.payeeId] : [])))],
      [...new Set(targets.flatMap((i) => (i.cardAccountId ? [i.cardAccountId] : [])))],
    );
    for (const t of candidates) likelyTx.set(t.id, t);
    // This month's own rows choose first; a transaction is offered to one row only.
    const marked = withLikely([...view.rows, ...view.carried], items, candidates);
    view = { ...view, rows: marked.slice(0, view.rows.length), carried: marked.slice(view.rows.length) };
  }

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
  const returnTo = `/payment-plan?month=${month.slice(0, 7)}`;
  // People with a balance, as the People screen counts them (FR-017).
  const persons = payees.filter((p) => p.kind === "person");
  const owing = peopleTotals(persons, (p) => personBalanceOf(p, plan.peopleMovements));
  const peopleOwed = persons
    .map((p) => ({ id: p.id, name: p.name, balanceMinor: personBalanceOf(p, plan.peopleMovements) }))
    .filter((p) => p.balanceMinor !== 0n)
    .sort((a, b) => a.name.localeCompare(b.name));

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
            >
              {row.status !== "paid" && row.status !== "skipped" && (
                <PayActions
                  itemId={row.itemId}
                  name={row.name}
                  month={row.month}
                  returnTo={returnTo}
                  currency={currency}
                  likely={row.likely && likelyTx.has(row.likely) ? { id: row.likely, amountMinor: likelyTx.get(row.likely)!.amountMinor, date: likelyTx.get(row.likely)!.date } : null}
                />
              )}
            </RowActions>
          );
        }}
      />
      <Comparison view={view} currency={currency} />
      <PeopleOwed people={peopleOwed} owedToYou={owing.owedToYou} youOwe={owing.youOwe} currency={currency} />
    </section>
  );
}
