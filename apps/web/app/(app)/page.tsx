import Link from "next/link";
import {
  addMonths,
  countedAccounts,
  DEFAULT_PREFERENCES,
  monthOf,
  movementsFromTotals,
  peopleTotals,
  periodOf,
  personBalanceOf,
  planUnpaidForSafeToSpend,
  safeToSpend,
  summarise,
  todayInZone,
} from "@ft/core";
import {
  balanceMovements,
  getPreferences,
  listAccounts,
  listGroups,
  listPayees,
  monthTotals,
  runInterestProposals,
  searchTransactions,
  toConfirmCount,
} from "@ft/db";
import { SafeToSpendCard } from "@/components/dashboard/SafeToSpendCard";
import { Money } from "@/components/Money";
import { PlanNudge } from "@/components/plan/PlanNudge";
import { QuickAdd } from "@/components/templates/QuickAdd";
import { WarrantyReminders } from "@/components/warranty/WarrantyReminders";
import { buttonVariants } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { loadPlan } from "@/lib/plan-data";
import { loadQuickAdd } from "@/lib/templates-data";
import { loadWarranties } from "@/lib/warranty-data";
import { createServerSupabase } from "@/lib/supabase/server";

function Figure({ id, label, href, children }: { id: string; label: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-lg border border-border p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span id={id} className="text-xl font-semibold">
        {children}
      </span>
    </Link>
  );
}

/**
 * Dashboard (R6 US1; FR-001 – FR-004): net worth as on Accounts, this month's income and spending,
 * safe to spend, To confirm and people totals — each linking to its screen. Every figure comes from
 * the same functions those screens use, so they always agree (SC-001).
 */
export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(prefs.timezone);
  const month = periodOf("this_month", todayIso, prefs.fyStartMonth);
  await runInterestProposals(supabase).catch(() => 0);
  const planMonthNow = monthOf(todayIso);
  const [accounts, groups, people, totals, months, upcoming, waiting, plan, quick, warranties] = await Promise.all([
    listAccounts(supabase),
    listGroups(supabase),
    listPayees(supabase, "person"),
    balanceMovements(supabase),
    monthTotals(supabase, month),
    searchTransactions(supabase, { upcoming: true, to: month.to }, null, 200),
    toConfirmCount(supabase),
    // R7: this month's unpaid plan items lower safe to spend; next month is for the nudge's count.
    loadPlan(supabase, prefs, [planMonthNow, addMonths(planMonthNow, 1)]),
    // R8: the first few quick-add templates.
    loadQuickAdd(supabase, prefs),
    // R9: warranty reminders due today.
    loadWarranties(supabase, prefs),
  ]);
  const currency = prefs.baseCurrency;

  if (accounts.length === 0) {
    return (
      <section aria-labelledby="page-title" className="flex max-w-prose flex-col gap-4">
        <h1 id="page-title" className="text-2xl font-semibold">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Your net worth, this month&rsquo;s income and spending, what is safe to spend and what people owe you will appear
          here once you add your accounts and transactions.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/accounts/new" className={buttonVariants()}>
            Add account
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

  const movements = movementsFromTotals(accounts, totals.accounts);
  const summary = summarise(accounts, { view: prefs.accountsView, groups, people, movements, personMovements: totals.people });
  // Safe to spend counts accounts as net worth does, without people (money they owe is not in hand).
  const counted = countedAccounts([...summary.sections.flatMap((s) => s.rows), ...summary.archived]);
  const safe = safeToSpend({
    heldMinor: counted.heldMinor,
    cardOwedMinor: counted.cardOwedMinor,
    countedAccountIds: counted.ids,
    upcoming: upcoming.rows,
    monthEnd: month.to,
    bufferMinor: BigInt(prefs.bufferMinor),
    // Unpaid plan items not already counted as card owed or as an upcoming transaction (R7 FR-018).
    planUnpaidMinor: planUnpaidForSafeToSpend(plan.views.get(planMonthNow)!, new Map(plan.items.map((i) => [i.id, i])), counted.ids, month.to),
  });
  const thisMonth = months[0] ?? { incomeMinor: 0n, spendingMinor: 0n };
  const net = thisMonth.incomeMinor - thisMonth.spendingMinor;
  const owing = peopleTotals(people, (p) => personBalanceOf(p, totals.people));

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <h1 id="page-title" className="text-2xl font-semibold">
        Dashboard
      </h1>

      {quick.templates.length > 0 && (
        <section id="quick-add-strip" aria-labelledby="quick-add-strip-title" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="quick-add-strip-title" className="text-lg font-semibold">
              Quick add
            </h2>
            <Link href="/transactions#quick-add" className="text-sm text-brand-strong underline dark:text-brand">
              More
            </Link>
          </div>
          <QuickAdd templates={quick.templates} info={quick.info} today={quick.today} currency={currency} limit={6} returnTo="/" />
        </section>
      )}

      {warranties.due.length > 0 && (
        <WarrantyReminders due={warranties.due.map((w) => ({ id: w.id, item: w.item, daysLeft: w.daysLeft, reminder: w.reminder! }))} />
      )}

      {plan.items.some((i) => i.state === "active") && (
        <PlanNudge
          planNudge={prefs.planNudge}
          planCheckedMonth={prefs.planCheckedMonth}
          timezone={prefs.timezone}
          estimated={Object.fromEntries([...plan.views].map(([m, v]) => [m, v.estimatedCount]))}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure id="dash-net-worth" label="Net worth" href="/accounts">
          <Money value={summary.netWorth < 0n ? -summary.netWorth : summary.netWorth} currency={currency} />
          {summary.netWorth < 0n && <span className="text-sm font-normal"> negative</span>}
        </Figure>
        <Figure id="dash-owned" label="Owned" href="/accounts">
          <Money value={summary.owned} currency={currency} />
        </Figure>
        <Figure id="dash-owed" label="Owed" href="/accounts">
          <Money value={summary.owed} currency={currency} />
        </Figure>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure id="dash-income" label="Income this month" href="/reports?view=income&period=this_month">
          <Money value={thisMonth.incomeMinor} currency={currency} />
        </Figure>
        <Figure id="dash-spending" label="Spending this month" href="/reports?view=spending&period=this_month">
          <Money value={thisMonth.spendingMinor} currency={currency} />
        </Figure>
        <Figure id="dash-net" label={net < 0n ? "Spent more than earned" : "Left over this month"} href="/reports?view=trend">
          <Money value={net < 0n ? -net : net} currency={currency} />
        </Figure>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SafeToSpendCard safe={safe} currency={currency} />
        <div className="flex flex-col gap-3">
          <Figure id="dash-to-confirm" label="To confirm" href="/transactions">
            {waiting === 1 ? "1 transaction" : `${waiting} transactions`}
          </Figure>
          <Figure id="dash-people-owe-you" label="People owe you" href="/people">
            <Money value={owing.owedToYou} currency={currency} />
          </Figure>
          <Figure id="dash-you-owe-people" label="You owe people" href="/people">
            <Money value={owing.youOwe} currency={currency} />
          </Figure>
        </div>
      </div>
    </section>
  );
}
