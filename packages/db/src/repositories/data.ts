import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeInput } from "@ft/core";

/**
 * The user's own data as a whole (R5): is it empty, load the demo household, reset it. Use the
 * caller's client: the database functions act for auth.uid() only (specs/005-demo-data/contracts).
 */

type Device = "web" | "android";
export type Counts = Partial<Record<string, number>>;

const TABLES = ["accounts", "account_groups", "categories", "tags", "payees", "transactions", "person_rates"] as const;

/** True when the user has no financial rows at all (deleted ones count — the database rule). */
export async function hasNoData(db: SupabaseClient): Promise<boolean> {
  const counts = await Promise.all(
    TABLES.map(async (table) => {
      const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
      if (error) throw new Error(`DATA_STATUS_FAILED: ${error.code ?? ""}`);
      return count ?? 0;
    }),
  );
  return counts.every((n) => n === 0);
}

/** Maps the database's refusals to error codes the route turns into responses. */
function failure(error: { message: string; code?: string }): Error {
  for (const code of ["NOT_EMPTY", "DEMO_REJECTED", "USER_INACTIVE", "VALIDATION_FAILED"]) {
    if (error.message.includes(code)) return new Error(code);
  }
  return new Error(`DATA_ACTION_FAILED: ${error.code ?? ""}`);
}

export async function loadDemoData(db: SupabaseClient, changes: ChangeInput[], device: Device): Promise<{ loaded: Counts }> {
  const { data, error } = await db.schema("app").rpc("load_demo_data", { p_changes: changes, p_device: device });
  if (error) throw failure(error);
  return data as { loaded: Counts };
}

export async function resetMyData(db: SupabaseClient, device: Device): Promise<{ removed: Counts }> {
  const { data, error } = await db.schema("app").rpc("reset_my_data", { p_device: device });
  if (error) throw failure(error);
  return data as { removed: Counts };
}

export async function resetAndLoadDemo(
  db: SupabaseClient,
  changes: ChangeInput[],
  device: Device,
): Promise<{ removed: Counts; loaded: Counts }> {
  const { data, error } = await db.schema("app").rpc("reset_and_load_demo", { p_changes: changes, p_device: device });
  if (error) throw failure(error);
  return data as { removed: Counts; loaded: Counts };
}
