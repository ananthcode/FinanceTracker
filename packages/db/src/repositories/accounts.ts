import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType, AccountView, GroupView } from "@ft/core";

/**
 * Accounts read repository (T030). Use the caller's client: row-level security returns only their
 * own rows. Money columns are read as text and converted to bigint, so no amount ever passes
 * through a floating-point number (constitution II).
 */
const ACCOUNT_COLUMNS =
  "id, name, type, opening_balance_minor::text, opening_balance_date, currency, colour, icon, sort_key, group_id, " +
  "include_in_net_worth, notes, credit_limit_minor::text, state";

interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  opening_balance_minor: string;
  opening_balance_date: string;
  currency: string;
  colour: string;
  icon: string;
  sort_key: string;
  group_id: string | null;
  include_in_net_worth: boolean;
  notes: string | null;
  credit_limit_minor: string | null;
  state: AccountView["state"];
}

function fromRow(row: AccountRow): AccountView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    openingBalanceMinor: BigInt(row.opening_balance_minor),
    openingBalanceDate: row.opening_balance_date,
    currency: row.currency.trim(),
    colour: row.colour,
    icon: row.icon,
    sortKey: row.sort_key,
    groupId: row.group_id,
    includeInNetWorth: row.include_in_net_worth,
    notes: row.notes,
    creditLimitMinor: row.credit_limit_minor === null ? null : BigInt(row.credit_limit_minor),
    state: row.state,
  };
}

/** The caller's accounts that are not deleted (active and archived). */
export async function listAccounts(db: SupabaseClient): Promise<AccountView[]> {
  const { data, error } = await db.from("accounts").select(ACCOUNT_COLUMNS).neq("state", "deleted");
  if (error) throw new Error(`ACCOUNTS_READ_FAILED: ${error.code ?? ""}`);
  return (data as unknown as AccountRow[]).map(fromRow);
}

/** One of the caller's accounts, or null (also for deleted ones). */
export async function getAccount(db: SupabaseClient, id: string): Promise<AccountView | null> {
  const { data, error } = await db.from("accounts").select(ACCOUNT_COLUMNS).eq("id", id).neq("state", "deleted").maybeSingle();
  if (error) throw new Error(`ACCOUNTS_READ_FAILED: ${error.code ?? ""}`);
  return data ? fromRow(data as unknown as AccountRow) : null;
}

/** The caller's active user groups. */
export async function listGroups(db: SupabaseClient): Promise<GroupView[]> {
  const { data, error } = await db.from("account_groups").select("id, name, sort_key, state").eq("state", "active");
  if (error) throw new Error(`GROUPS_READ_FAILED: ${error.code ?? ""}`);
  return (data as { id: string; name: string; sort_key: string; state: GroupView["state"] }[]).map((g) => ({
    id: g.id,
    name: g.name,
    sortKey: g.sort_key,
    state: g.state,
  }));
}
