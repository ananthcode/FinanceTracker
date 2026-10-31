import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoriesStart, CategoryKind, CategoryView, PayeeKind, PayeeView, TagView } from "@ft/core";
import { DEFAULT_CATEGORIES } from "@ft/core";

/**
 * Categories, tags and payees read repository (R3 T017). Use the caller's client: row-level
 * security returns only their own rows. Money is read as text and converted to bigint, so no amount
 * passes through a floating-point number (constitution II). Deleted rows are never returned.
 */

/**
 * The API returns at most 1,000 rows per request (Supabase `max_rows`), and a user may have up to
 * 2,000 payees (FR-015): read every page, ordered by id so pages never overlap or skip.
 */
const PAGE = 1000;
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
  failure: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`${failure}: ${error.code ?? ""}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  colour: string;
  icon: string;
  hidden: boolean;
}

export async function listCategories(db: SupabaseClient): Promise<CategoryView[]> {
  const data = await readAll<CategoryRow>(
    (from, to) =>
      db.from("categories").select("id, name, kind, parent_id, colour, icon, hidden").neq("state", "deleted").order("id").range(from, to),
    "CATEGORIES_READ_FAILED",
  );
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parent_id,
    colour: c.colour,
    icon: c.icon,
    hidden: c.hidden,
  }));
}

export async function listTags(db: SupabaseClient): Promise<TagView[]> {
  return readAll<TagView>(
    (from, to) => db.from("tags").select("id, name").neq("state", "deleted").order("id").range(from, to),
    "TAGS_READ_FAILED",
  );
}

const PAYEE_COLUMNS =
  "id, name, kind, default_category_id, notes, hidden, opening_balance_minor::text, opening_balance_date, include_in_net_worth, interest_mode";

interface PayeeRow {
  id: string;
  name: string;
  kind: PayeeKind;
  default_category_id: string | null;
  notes: string | null;
  hidden: boolean;
  opening_balance_minor: string;
  opening_balance_date: string | null;
  include_in_net_worth: boolean;
  interest_mode: PayeeView["interestMode"];
}

function payeeFromRow(row: PayeeRow): PayeeView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    defaultCategoryId: row.default_category_id,
    notes: row.notes,
    hidden: row.hidden,
    openingBalanceMinor: BigInt(row.opening_balance_minor),
    openingBalanceDate: row.opening_balance_date,
    includeInNetWorth: row.include_in_net_worth,
    interestMode: row.interest_mode,
  };
}

/** The caller's payees, optionally only one kind (people for the People screen). */
export async function listPayees(db: SupabaseClient, kind?: PayeeKind): Promise<PayeeView[]> {
  const data = await readAll<PayeeRow>((from, to) => {
    const query = db.from("payees").select(PAYEE_COLUMNS).neq("state", "deleted");
    return (kind ? query.eq("kind", kind) : query).order("id").range(from, to);
  }, "PAYEES_READ_FAILED");
  return data.map(payeeFromRow);
}

/** One of the caller's payees, or null (also for deleted ones). */
export async function getPayee(db: SupabaseClient, id: string): Promise<PayeeView | null> {
  const { data, error } = await db.from("payees").select(PAYEE_COLUMNS).eq("id", id).neq("state", "deleted").maybeSingle();
  if (error) throw new Error(`PAYEES_READ_FAILED: ${error.code ?? ""}`);
  return data ? payeeFromRow(data as unknown as PayeeRow) : null;
}

/**
 * Records the user's start choice (FR-007) and adds the default categories when asked — once
 * (research R3-06). The list always comes from packages/core, never from a request.
 */
export async function startCategories(
  db: SupabaseClient,
  choice: CategoriesStart,
  device: "web" | "android",
): Promise<{ choice: CategoriesStart; added: number }> {
  const { data, error } = await db
    .schema("app")
    .rpc("start_categories", { p_choice: choice, p_defaults: DEFAULT_CATEGORIES, p_device: device });
  if (error) {
    if (error.message.includes("USER_INACTIVE")) throw new Error("USER_INACTIVE");
    throw new Error("CATEGORIES_START_FAILED");
  }
  return data as { choice: CategoriesStart; added: number };
}
