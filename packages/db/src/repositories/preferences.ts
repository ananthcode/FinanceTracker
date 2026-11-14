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
  categories_start: Preferences["categoriesStart"];
  buffer_minor: string;
  plan_nudge: boolean;
  plan_checked_month: string | null;
  warranty_first_days: Preferences["warrantyFirstDays"];
  warranty_second_days: Preferences["warrantySecondDays"];
}

const COLUMNS = "base_currency, number_format, date_format, fy_start_month, timezone, accounts_view, categories_start, buffer_minor::text, plan_nudge, plan_checked_month, warranty_first_days, warranty_second_days";

function fromRow(row: PreferencesRow): Preferences {
  return {
    baseCurrency: row.base_currency.trim(),
    numberFormat: row.number_format,
    dateFormat: row.date_format,
    fyStartMonth: row.fy_start_month,
    timezone: row.timezone,
    accountsView: row.accounts_view,
    categoriesStart: row.categories_start,
    bufferMinor: String(row.buffer_minor),
    planNudge: row.plan_nudge,
    planCheckedMonth: row.plan_checked_month,
    warrantyFirstDays: row.warranty_first_days,
    warrantySecondDays: row.warranty_second_days,
  };
}

/** categoriesStart is never written here: only app.start_categories sets it (R3-06). */
function toRow(patch: Partial<Preferences>): Partial<PreferencesRow> {
  const row: Partial<PreferencesRow> = {};
  if (patch.baseCurrency !== undefined) row.base_currency = patch.baseCurrency;
  if (patch.numberFormat !== undefined) row.number_format = patch.numberFormat;
  if (patch.dateFormat !== undefined) row.date_format = patch.dateFormat;
  if (patch.fyStartMonth !== undefined) row.fy_start_month = patch.fyStartMonth;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.accountsView !== undefined) row.accounts_view = patch.accountsView;
  if (patch.bufferMinor !== undefined) row.buffer_minor = patch.bufferMinor;
  if (patch.planNudge !== undefined) row.plan_nudge = patch.planNudge;
  // The database keeps the later month (research R7-09).
  if (patch.planCheckedMonth) row.plan_checked_month = patch.planCheckedMonth;
  // R9-06: set together; the database checks the order.
  if (patch.warrantyFirstDays !== undefined) row.warranty_first_days = patch.warrantyFirstDays;
  if (patch.warrantySecondDays !== undefined) row.warranty_second_days = patch.warrantySecondDays;
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
