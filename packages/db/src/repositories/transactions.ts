import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovementTotals, PersonRateView, TransactionLine, TransactionView } from "@ft/core";

/**
 * Transactions read repository (R4 T017). Use the caller's client: RLS applies. Money arrives as
 * JSON numbers from jsonb (exact below 2^53, and amounts are at most 999,999,999,999 paise) or as
 * text, and is converted to bigint here — never used as a float (constitution II).
 */

type Raw = Record<string, unknown>;

const big = (v: unknown): bigint => BigInt(String(v));

function lineFromRaw(l: Raw): TransactionLine {
  return {
    id: l.id as string,
    amountMinor: big(l.amountMinor),
    categoryId: (l.categoryId as string | null) ?? null,
    personId: (l.personId as string | null) ?? null,
    personAction: (l.personAction as TransactionLine["personAction"]) ?? null,
    notes: (l.notes as string | null) ?? null,
    tagIds: (l.tagIds as string[] | undefined) ?? [],
  };
}

export function transactionFromRow(r: Raw): TransactionView {
  return {
    id: r.id as string,
    date: r.date as string,
    timeOfDay: r.time_of_day ? String(r.time_of_day).slice(0, 5) : null,
    kind: r.kind as TransactionView["kind"],
    flow: r.flow as TransactionView["flow"],
    accountId: (r.account_id as string | null) ?? null,
    toAccountId: (r.to_account_id as string | null) ?? null,
    amountMinor: big(r.amount_minor),
    payeeId: (r.payee_id as string | null) ?? null,
    personAction: (r.person_action as TransactionView["personAction"]) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    lines: ((r.lines as Raw[] | null) ?? []).map(lineFromRaw),
    tagIds: (r.tag_ids as string[] | null) ?? [],
    notes: (r.notes as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    status: r.status as TransactionView["status"],
    confirmed: r.confirmed as boolean,
    generated: r.generated as boolean,
    interestMonth: (r.interest_month as string | null) ?? null,
    userEdited: r.user_edited as boolean,
    state: r.state as TransactionView["state"],
  };
}

const COLUMNS =
  "id, date, time_of_day, kind, flow, account_id, to_account_id, amount_minor::text, payee_id, person_action, " +
  "category_id, lines, tag_ids, notes, reference, status, confirmed, generated, interest_month, user_edited, state";

/** One of the caller's transactions, or null (also for deleted ones). */
export async function getTransaction(db: SupabaseClient, id: string): Promise<TransactionView | null> {
  const { data, error } = await db.from("transactions").select(COLUMNS).eq("id", id).eq("state", "active").maybeSingle();
  if (error) throw new Error(`TRANSACTIONS_READ_FAILED: ${error.code ?? ""}`);
  return data ? transactionFromRow(data as unknown as Raw) : null;
}

export interface TransactionFilters {
  text?: string;
  from?: string;
  to?: string;
  accountId?: string;
  /** A category id (its sub-categories included) or "uncategorised". */
  categoryId?: string;
  payeeId?: string;
  tagId?: string;
  kinds?: TransactionView["kind"][];
  statuses?: TransactionView["status"][];
  minMinor?: string;
  maxMinor?: string;
  /** true: only upcoming / awaiting confirmation; false: only confirmed. */
  upcoming?: boolean;
}

export interface TransactionCursor {
  date: string;
  time: string;
  createdAt: string;
  id: string;
}

export interface TransactionPage {
  rows: TransactionView[];
  count: number;
  /** Money in minus money out of the counted matches, transfers excluded. */
  totalMinor: bigint;
  next: TransactionCursor | null;
}

/** Filtered, newest-first page of the caller's transactions (app.search_transactions, FR-017). */
export async function searchTransactions(
  db: SupabaseClient,
  filters: TransactionFilters = {},
  after: TransactionCursor | null = null,
  limit = 50,
): Promise<TransactionPage> {
  const { data, error } = await db
    .schema("app")
    .rpc("search_transactions", { p_filters: filters, p_after: after, p_limit: limit });
  if (error) throw new Error(`TRANSACTIONS_SEARCH_FAILED: ${error.code ?? ""}`);
  const raw = data as { rows: Raw[]; count: number; totalMinor: string; next: TransactionCursor | null };
  return { rows: raw.rows.map(transactionFromRow), count: raw.count, totalMinor: BigInt(raw.totalMinor), next: raw.next };
}

/** How many transactions wait in "To confirm" (FR-002a, FR-014). */
export async function toConfirmCount(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.schema("app").rpc("to_confirm_count");
  if (error) throw new Error(`TO_CONFIRM_READ_FAILED: ${error.code ?? ""}`);
  return Number(data ?? 0);
}

export interface BalanceMovements {
  accounts: MovementTotals;
  people: MovementTotals;
}

/** Every account's and person's counted movement total, for the balances on a screen (FR-007, FR-008). */
export async function balanceMovements(db: SupabaseClient): Promise<BalanceMovements> {
  const { data, error } = await db.schema("app").rpc("balance_movements");
  if (error) throw new Error(`BALANCES_READ_FAILED: ${error.code ?? ""}`);
  const raw = data as { accounts: Record<string, string>; people: Record<string, string> };
  const toTotals = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, BigInt(v)]));
  return { accounts: toTotals(raw.accounts), people: toTotals(raw.people) };
}

/** A person's rate history, oldest first (FR-013). */
export async function listPersonRates(db: SupabaseClient, payeeId: string): Promise<PersonRateView[]> {
  const { data, error } = await db
    .from("person_rates")
    .select("id, payee_id, effective_month, rate_e4")
    .eq("payee_id", payeeId)
    .neq("state", "deleted")
    .order("effective_month");
  if (error) throw new Error(`PERSON_RATES_READ_FAILED: ${error.code ?? ""}`);
  return (data as { id: string; payee_id: string; effective_month: string; rate_e4: number }[]).map((r) => ({
    id: r.id,
    payeeId: r.payee_id,
    effectiveMonth: r.effective_month,
    rateE4: r.rate_e4,
  }));
}
