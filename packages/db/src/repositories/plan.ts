import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkedTransaction, PlanItem, PlanOccurrence, PlanTerm, TransactionView } from "@ft/core";
import { transactionFromRow } from "./transactions";

/**
 * Plan read repository (R7 T016, research R7-13). Use the caller's client: RLS select-own applies, so no
 * SECURITY DEFINER reader is needed. Money arrives as text and becomes bigint here (constitution II).
 * Reads page through results, because the API returns at most 1,000 rows at a time.
 */

type Raw = Record<string, unknown>;
const PAGE = 1000;

async function all(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string } | null }>, label: string): Promise<Raw[]> {
  const rows: Raw[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`${label}_READ_FAILED: ${error.code ?? ""}`);
    const page = (data ?? []) as Raw[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

function termFromRaw(t: Raw): PlanTerm {
  return {
    fromMonth: String(t.fromMonth),
    amountMinor: t.amountMinor === null || t.amountMinor === undefined ? null : BigInt(String(t.amountMinor)),
    dueDay: Number(t.dueDay),
    accountId: String(t.accountId),
  };
}

export function planItemFromRow(r: Raw): PlanItem {
  return {
    id: r.id as string,
    name: r.name as string,
    target: r.target as PlanItem["target"],
    payeeId: (r.payee_id as string | null) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    cardAccountId: (r.card_account_id as string | null) ?? null,
    personAction: (r.person_action as PlanItem["personAction"]) ?? null,
    frequency: r.frequency as PlanItem["frequency"],
    intervalMonths: Number(r.interval_months),
    startMonth: r.start_month as string,
    endMonth: (r.end_month as string | null) ?? null,
    amountVaries: r.amount_varies as boolean,
    terms: ((r.terms as Raw[] | null) ?? []).map(termFromRaw),
    notes: (r.notes as string | null) ?? null,
    state: r.state as PlanItem["state"],
  };
}

const ITEM_COLUMNS =
  "id, name, target, payee_id, category_id, card_account_id, person_action, frequency, interval_months, start_month, end_month, " +
  "amount_varies, terms, notes, state";

/** Every plan item, deleted ones too (their paid months stay, FR-008). */
export async function planItems(db: SupabaseClient): Promise<PlanItem[]> {
  const rows = await all((from, to) => db.from("plan_items").select(ITEM_COLUMNS).order("created_at").order("id").range(from, to), "PLAN_ITEMS");
  return rows.map(planItemFromRow);
}

/** One item, or null (deleted ones too). */
export async function getPlanItem(db: SupabaseClient, id: string): Promise<PlanItem | null> {
  const { data, error } = await db.from("plan_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`PLAN_ITEMS_READ_FAILED: ${error.code ?? ""}`);
  return data ? planItemFromRow(data as unknown as Raw) : null;
}

/** Item months set by the user up to and including `upTo` (`yyyy-MM-01`), for carry-forward. */
export async function planOccurrences(db: SupabaseClient, upTo: string): Promise<PlanOccurrence[]> {
  const rows = await all(
    (from, to) =>
      db.from("plan_occurrences").select("id, item_id, month, amount_minor::text, skipped").lte("month", upTo).order("id").range(from, to),
    "PLAN_OCCURRENCES",
  );
  return rows.map((r) => ({
    id: r.id as string,
    itemId: r.item_id as string,
    month: r.month as string,
    amountMinor: r.amount_minor === null ? null : BigInt(String(r.amount_minor)),
    skipped: r.skipped as boolean,
  }));
}

/** Every linked transaction for months up to `upTo`, narrow columns (R7-13). */
export async function planLinks(db: SupabaseClient, upTo: string): Promise<LinkedTransaction[]> {
  const rows = await all(
    (from, to) =>
      db
        .from("transactions")
        .select("id, plan_item_id, plan_month, amount_minor::text, date, state, confirmed, status")
        .not("plan_item_id", "is", null)
        .lte("plan_month", upTo)
        .order("id")
        .range(from, to),
    "PLAN_LINKS",
  );
  return rows.map((r) => ({
    id: r.id as string,
    planItemId: r.plan_item_id as string,
    planMonth: r.plan_month as string,
    amountMinor: BigInt(String(r.amount_minor)),
    date: r.date as string,
    state: r.state as LinkedTransaction["state"],
    confirmed: r.confirmed as boolean,
    status: r.status as LinkedTransaction["status"],
  }));
}

const TX_COLUMNS =
  "id, date, time_of_day, kind, flow, account_id, to_account_id, amount_minor::text, payee_id, person_action, " +
  "category_id, lines, tag_ids, notes, reference, status, confirmed, generated, interest_month, user_edited, state, plan_item_id, plan_month";

/**
 * Unlinked active transactions dated `from`…`to` paid to one of `payeeIds` or into one of `cardIds`:
 * the candidates for likely matches (R7-07).
 */
export async function planCandidates(
  db: SupabaseClient,
  from: string,
  to: string,
  payeeIds: readonly string[],
  cardIds: readonly string[],
): Promise<TransactionView[]> {
  const targets = [
    ...(payeeIds.length > 0 ? [`payee_id.in.(${payeeIds.join(",")})`] : []),
    ...(cardIds.length > 0 ? [`to_account_id.in.(${cardIds.join(",")})`] : []),
  ];
  if (targets.length === 0) return [];
  const rows = await all(
    (start, end) =>
      db
        .from("transactions")
        .select(TX_COLUMNS)
        .is("plan_item_id", null)
        .eq("state", "active")
        .neq("status", "void")
        .gte("date", from)
        .lte("date", to)
        .or(targets.join(","))
        .order("date")
        .order("id")
        .range(start, end),
    "PLAN_CANDIDATES",
  );
  return rows.map(transactionFromRow);
}
