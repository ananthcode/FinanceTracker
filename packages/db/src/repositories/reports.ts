import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthTotalRow, Period, TotalRow } from "@ft/core";

/**
 * Report readers (R6 contracts/database.md). Use the caller's client: the functions act for
 * auth.uid() only. Money arrives as text and becomes bigint here.
 */

export async function categoryPayeeTotals(db: SupabaseClient, period: Period): Promise<TotalRow[]> {
  const { data, error } = await db.schema("app").rpc("category_payee_totals", { p_from: period.from, p_to: period.to });
  if (error) throw new Error(`REPORT_READ_FAILED: ${error.code ?? ""}`);
  return (data as { kind: TotalRow["kind"]; categoryId: string | null; payeeId: string | null; totalMinor: string }[]).map((r) => ({
    kind: r.kind,
    categoryId: r.categoryId,
    payeeId: r.payeeId,
    totalMinor: BigInt(r.totalMinor),
  }));
}

export async function monthTotals(db: SupabaseClient, period: Period): Promise<MonthTotalRow[]> {
  const { data, error } = await db.schema("app").rpc("month_totals", { p_from: period.from, p_to: period.to });
  if (error) throw new Error(`REPORT_READ_FAILED: ${error.code ?? ""}`);
  return (data as { month: string; incomeMinor: string; spendingMinor: string }[]).map((r) => ({
    month: r.month,
    incomeMinor: BigInt(r.incomeMinor),
    spendingMinor: BigInt(r.spendingMinor),
  }));
}
