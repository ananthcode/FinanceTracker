import type { SupabaseClient } from "@supabase/supabase-js";
import type { Preferences } from "@ft/core";

/**
 * User preferences repository (T080). Works with any client: the user's own (RLS applies) or the
 * service role. Maps database columns to the app's field names in one place.
 */
interface PreferencesRow {
  base_currency: string;
  number_format: Preferences["numberFormat"];
  date_format: string;
  fy_start_month: number;
  timezone: string;
  accounts_view: Preferences["accountsView"];
}

const COLUMNS = "base_currency, number_format, date_format, fy_start_month, timezone, accounts_view";

function fromRow(row: PreferencesRow): Preferences {
  return {
    baseCurrency: row.base_currency.trim(),
    numberFormat: row.number_format,
    dateFormat: row.date_format,
    fyStartMonth: row.fy_start_month,
    timezone: row.timezone,
    accountsView: row.accounts_view,
  };
}

function toRow(patch: Partial<Preferences>): Partial<PreferencesRow> {
  const row: Partial<PreferencesRow> = {};
  if (patch.baseCurrency !== undefined) row.base_currency = patch.baseCurrency;
  if (patch.numberFormat !== undefined) row.number_format = patch.numberFormat;
  if (patch.dateFormat !== undefined) row.date_format = patch.dateFormat;
  if (patch.fyStartMonth !== undefined) row.fy_start_month = patch.fyStartMonth;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.accountsView !== undefined) row.accounts_view = patch.accountsView;
  return row;
}

export async function getPreferences(db: SupabaseClient, userId: string): Promise<Preferences | null> {
  const { data, error } = await db.from("user_preferences").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`PREFERENCES_READ_FAILED: ${error.code ?? ""}`);
  return data ? fromRow(data as PreferencesRow) : null;
}

/** Applies a partial update and returns the stored result. Database triggers enforce the rules. */
export async function updatePreferences(
  db: SupabaseClient,
  userId: string,
  patch: Partial<Preferences>,
): Promise<Preferences> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) {
    const current = await getPreferences(db, userId);
    if (!current) throw new Error("PREFERENCES_NOT_FOUND");
    return current;
  }
  const { data, error } = await db.from("user_preferences").update(row).eq("user_id", userId).select(COLUMNS).single();
  if (error) {
    const err = new Error(error.message.includes("BASE_CURRENCY_LOCKED") ? "BASE_CURRENCY_LOCKED" : "PREFERENCES_UPDATE_FAILED");
    throw err;
  }
  return fromRow(data as PreferencesRow);
}
