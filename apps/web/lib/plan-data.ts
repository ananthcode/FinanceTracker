import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addMonths,
  earliestPlanMonth,
  monthOf,
  movementsFromTotals,
  planMonth,
  summarise,
  todayInZone,
  type AccountView,
  type MovementTotals,
  type Month,
  type PlanAccount,
  type PlanItem,
  type PlanMonthView,
  type Preferences,
} from "@ft/core";
import { balanceMovements, listAccounts, listGroups, planItems, planLinks, planOccurrences } from "@ft/db";

/** How far ahead the plan can be viewed (FR-004). */
export const PLAN_MONTHS_AHEAD = 24;

export interface PlanData {
  today: string;
  currentMonth: Month;
  earliest: Month;
  latest: Month;
  items: PlanItem[];
  accounts: AccountView[];
  planAccounts: PlanAccount[];
  /** Each person's counted movement total, for the people panel (same source as People and the Dashboard). */
  peopleMovements: MovementTotals;
  /** The months asked for, each kept within earliest … latest. */
  months: Month[];
  /** Views by month, for those months. */
  views: Map<Month, PlanMonthView>;
}

/**
 * Everything the plan needs, read with the user's client (RLS, research R7-13), and the views of the
 * months asked for, computed by core (planMonth) as Android will on its local data.
 */
export async function loadPlan(supabase: SupabaseClient, prefs: Preferences, months: readonly Month[] | "current"): Promise<PlanData> {
  const today = todayInZone(prefs.timezone);
  const currentMonth = monthOf(today);
  const wanted = months === "current" ? [currentMonth] : months;
  const upTo = wanted.reduce((max, m) => (m > max ? m : max), currentMonth);
  const [items, occurrences, links, accounts, groups, totals] = await Promise.all([
    planItems(supabase),
    planOccurrences(supabase, upTo),
    planLinks(supabase, upTo),
    listAccounts(supabase),
    listGroups(supabase),
    balanceMovements(supabase),
  ]);
  const movements = movementsFromTotals(accounts, totals.accounts);
  const summary = summarise(accounts, { view: prefs.accountsView, groups, people: [], movements, personMovements: {} });
  const rows = [...summary.sections.flatMap((s) => s.rows), ...summary.archived];
  const planAccounts: PlanAccount[] = rows.map((r) => ({
    id: r.account.id,
    type: r.account.type,
    balanceMinor: r.balance,
    creditLimitMinor: r.account.creditLimitMinor,
    state: r.account.state,
  }));
  const earliest = earliestPlanMonth(items, currentMonth);
  const latest = addMonths(currentMonth, PLAN_MONTHS_AHEAD);
  const shown = wanted.map((m) => (m < earliest ? earliest : m > latest ? latest : m));
  const views = new Map<Month, PlanMonthView>();
  for (const month of shown) views.set(month, planMonth({ month, today, items, occurrences, links, accounts: planAccounts }));
  return {
    today,
    currentMonth,
    earliest,
    latest,
    months: shown,
    items,
    accounts,
    planAccounts,
    peopleMovements: totals.people,
    views,
  };
}
