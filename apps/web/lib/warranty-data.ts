import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  categoryPath,
  indexCategories,
  sortWarranties,
  todayInZone,
  warrantyDaysLeft,
  warrantyReminder,
  warrantyTimeLeft,
  type Preferences,
} from "@ft/core";
import { listCategories, listPayees, listWarranties, transactionsWithAttachments } from "@ft/db";

/** One warranty as the screens show it. Plain values (it crosses to client components), money as text. */
export interface WarrantyRow {
  id: string;
  /** The item: payee, else notes, else category, else "Purchase". */
  item: string;
  date: string;
  until: string;
  note: string | null;
  amountMinor: string;
  timeLeft: string;
  daysLeft: number;
  receipt: boolean;
  /** The reminder due today (R9-06), or null. */
  reminder: 1 | 2 | null;
}

/**
 * The user's warranties (R9-07): active soonest first, expired latest first, and the reminders due today.
 * Read with the user's own client (RLS).
 */
export async function loadWarranties(
  supabase: SupabaseClient,
  prefs: Preferences,
): Promise<{ today: string; active: WarrantyRow[]; expired: WarrantyRow[]; due: WarrantyRow[] }> {
  const today = todayInZone(prefs.timezone);
  const rows = await listWarranties(supabase);
  if (rows.length === 0) return { today, active: [], expired: [], due: [] };
  const [payees, categories, receipts] = await Promise.all([
    listPayees(supabase),
    listCategories(supabase),
    transactionsWithAttachments(
      supabase,
      rows.map((r) => r.id),
    ),
  ]);
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));
  const index = indexCategories(categories);
  const toRow = (t: (typeof rows)[number]): WarrantyRow => {
    const until = t.warrantyUntil!;
    const category = t.categoryId ? categoryPath(t.categoryId, index) : null;
    const notes = t.notes?.trim() ? t.notes.trim().split("\n")[0]! : null;
    return {
      id: t.id,
      item: (t.payeeId && payeeName.get(t.payeeId)) || notes || category || "Purchase",
      date: t.date,
      until,
      note: t.warrantyNote,
      amountMinor: t.amountMinor.toString(),
      timeLeft: warrantyTimeLeft(today, until),
      daysLeft: warrantyDaysLeft(today, until),
      receipt: receipts.has(t.id),
      reminder: warrantyReminder(today, until, t.warrantyDismissed, prefs),
    };
  };
  const sorted = sortWarranties(rows, today);
  const active = sorted.active.map(toRow);
  return { today, active, expired: sorted.expired.map(toRow), due: active.filter((r) => r.reminder !== null) };
}
