import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateView, TransactionLine } from "@ft/core";

/**
 * Templates read repository (R8 T004, research R8-09). Use the caller's client: RLS select-own applies.
 * Money arrives as text and becomes bigint here (constitution II).
 */

type Raw = Record<string, unknown>;

function lineFromRaw(l: Raw): TransactionLine {
  return {
    id: String(l.id),
    amountMinor: BigInt(String(l.amountMinor)),
    categoryId: (l.categoryId as string | null) ?? null,
    personId: (l.personId as string | null) ?? null,
    personAction: (l.personAction as TransactionLine["personAction"]) ?? null,
    notes: (l.notes as string | null) ?? null,
    tagIds: (l.tagIds as string[] | undefined) ?? [],
  };
}

export function templateFromRow(r: Raw): TemplateView {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as TemplateView["kind"],
    flow: r.flow as TemplateView["flow"],
    accountId: r.account_id as string,
    toAccountId: (r.to_account_id as string | null) ?? null,
    amountMinor: r.amount_minor === null || r.amount_minor === undefined ? null : BigInt(String(r.amount_minor)),
    payeeId: (r.payee_id as string | null) ?? null,
    personAction: (r.person_action as TemplateView["personAction"]) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    lines: ((r.lines as Raw[] | null) ?? []).map(lineFromRaw),
    tagIds: (r.tag_ids as string[] | null) ?? [],
    notes: (r.notes as string | null) ?? null,
    planItemId: (r.plan_item_id as string | null) ?? null,
    sortKey: r.sort_key as string,
    hidden: r.hidden as boolean,
    state: r.state as TemplateView["state"],
  };
}

const COLUMNS =
  "id, name, kind, flow, account_id, to_account_id, amount_minor::text, payee_id, person_action, category_id, lines, tag_ids, notes, " +
  "plan_item_id, sort_key, hidden, state";

/** Every live template (hidden ones too), in no particular order: core orders them. At most 100. */
export async function listTemplates(db: SupabaseClient): Promise<TemplateView[]> {
  const { data, error } = await db.from("transaction_templates").select(COLUMNS).neq("state", "deleted").limit(200);
  if (error) throw new Error(`TEMPLATES_READ_FAILED: ${error.code ?? ""}`);
  return (data as unknown as Raw[]).map(templateFromRow);
}

/** One live template, or null. */
export async function getTemplate(db: SupabaseClient, id: string): Promise<TemplateView | null> {
  const { data, error } = await db.from("transaction_templates").select(COLUMNS).eq("id", id).neq("state", "deleted").maybeSingle();
  if (error) throw new Error(`TEMPLATES_READ_FAILED: ${error.code ?? ""}`);
  return data ? templateFromRow(data as unknown as Raw) : null;
}
