"use server";

import { searchTransactions, type TransactionPage } from "@ft/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { FiltersSchema, parseCursor } from "@/lib/transactions";

/**
 * "Load more" for the transactions list (R4 contracts/http-api.md): the next keyset page through the
 * caller's own client, so row-level security applies. Input is checked; nothing is logged.
 */
export async function loadMoreTransactions(filters: unknown, after: unknown): Promise<TransactionPage | null> {
  const parsed = FiltersSchema.safeParse(filters);
  const cursor = parseCursor(after);
  if (!parsed.success || !cursor) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return searchTransactions(supabase, parsed.data, cursor, 50);
}
