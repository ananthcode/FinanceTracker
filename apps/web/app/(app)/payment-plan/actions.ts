"use server";

import { z } from "zod";
import {
  addMonths,
  DEFAULT_PREFERENCES,
  likelyMatches,
  monthName,
  monthOf,
  paysSuggestions,
  PERSON_ACTIONS,
  TRANSACTION_KINDS,
  transactionLabel,
  type PlanRow,
  type TransactionView,
} from "@ft/core";
import { getPreferences, listPayees, planCandidates, planItems, searchTransactions } from "@ft/db";
import { loadPlan } from "@/lib/plan-data";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Server actions for the plan (R7 contracts/http-api.md): suggestions only — nothing is linked here.
 * Both run with the caller's own session, so row-level security applies; input is checked; nothing is
 * logged. Money crosses to the browser as decimal strings of paise.
 */

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);

const SuggestionInput = z
  .object({
    kind: z.enum(TRANSACTION_KINDS),
    toAccountId: z.uuid().nullable(),
    payeeId: z.uuid().nullable(),
    personAction: z.enum(PERSON_ACTIONS).nullable(),
    amountMinor: z.string().regex(/^\d{1,12}$/),
    date: z.iso.date(),
  })
  .strict();

export interface PlanSuggestion {
  itemId: string;
  month: string;
  name: string;
  monthLabel: string;
  leftMinor: string;
}

/** The unpaid item-months a transaction being entered likely pays, best first (FR-013). */
export async function planSuggestions(input: unknown): Promise<PlanSuggestion[]> {
  const parsed = SuggestionInput.safeParse(input);
  if (!parsed.success) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return [];
  const prefs = (await getPreferences(supabase, data.user.id)) ?? DEFAULT_PREFERENCES;
  // Within 10 days of a due date can reach into the month before or after the transaction's.
  const month = monthOf(parsed.data.date);
  const plan = await loadPlan(supabase, prefs, [addMonths(month, -1), month, addMonths(month, 1)]);
  const rows = new Map<string, PlanRow>();
  for (const view of plan.views.values()) for (const r of view.rows) rows.set(`${r.itemId}|${r.month}`, r);
  const items = new Map(plan.items.map((i) => [i.id, i]));
  return paysSuggestions({ ...parsed.data, amountMinor: BigInt(parsed.data.amountMinor) }, [...rows.values()], items)
    .slice(0, 5)
    .map((r) => ({ itemId: r.itemId, month: r.month, name: r.name, monthLabel: monthName(r.month), leftMinor: r.leftMinor.toString() }));
}

const CandidateInput = z.object({ itemId: z.uuid(), month: Month, query: z.string().max(100).optional() }).strict();

export interface LinkCandidate {
  id: string;
  date: string;
  amountMinor: string;
  /** "Spent at City Power Board", in words. */
  label: string;
  notes: string | null;
  likely: boolean;
  /** Set when it already pays an item-month: it must be unlinked first (US3 3). */
  linked: { name: string; monthLabel: string } | null;
}

/**
 * Transactions that could pay an item-month (FR-011): likely matches first, then — with a search text —
 * any of the caller's transactions through R4's search. Ones that cannot pay a plan item are left out.
 */
export async function linkCandidates(input: unknown): Promise<LinkCandidate[]> {
  const parsed = CandidateInput.safeParse(input);
  if (!parsed.success) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return [];
  const prefs = (await getPreferences(supabase, data.user.id)) ?? DEFAULT_PREFERENCES;
  const { itemId, month, query } = parsed.data;
  const [plan, payees, allItems] = await Promise.all([loadPlan(supabase, prefs, [month]), listPayees(supabase), planItems(supabase)]);
  const item = plan.items.find((i) => i.id === itemId && i.state === "active");
  // The loader keeps months inside the plan's range; an item-month outside it is not shown anywhere.
  const view = plan.views.get(month);
  const row = view?.rows.find((r) => r.itemId === itemId);
  if (!item || !row) return [];

  const due = new Date(`${row.dueDate}T00:00:00Z`);
  const shift = (days: number) => new Date(due.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const from = shift(-10) < month ? shift(-10) : month;
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const to = shift(10) > monthEnd ? shift(10) : monthEnd;
  const near = await planCandidates(supabase, from, to, item.payeeId ? [item.payeeId] : [], item.cardAccountId ? [item.cardAccountId] : []);
  const likely = likelyMatches(row, item, near);
  const found: TransactionView[] = [...likely];
  if (query && query.trim() !== "") {
    const page = await searchTransactions(supabase, { text: query.trim(), kinds: ["expense", "transfer", "person"] }, null, 20);
    for (const t of page.rows) if (!found.some((f) => f.id === t.id)) found.push(t);
  }

  const accountName = new Map(plan.accounts.map((a) => [a.id, a.name]));
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));
  const itemName = new Map(allItems.map((i) => [i.id, i.name]));
  const names = { account: (id: string) => accountName.get(id) ?? "a removed account", payee: (id: string) => payeeName.get(id) ?? "a removed payee" };
  const likelyIds = new Set(likely.map((t) => t.id));
  return found
    .filter((t) => t.state === "active" && t.status !== "void" && (t.kind !== "person" || ["lent", "repaid_to", "paid_on_behalf"].includes(t.personAction ?? "")))
    .map((t) => ({
      id: t.id,
      date: t.date,
      amountMinor: t.amountMinor.toString(),
      label: transactionLabel(t, names),
      notes: t.notes,
      likely: likelyIds.has(t.id),
      linked: t.planItemId && t.planMonth ? { name: itemName.get(t.planItemId) ?? "a planned payment", monthLabel: monthName(t.planMonth) } : null,
    }));
}
