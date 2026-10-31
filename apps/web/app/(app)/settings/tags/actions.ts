"use server";

import { z } from "zod";
import { searchTransactions } from "@ft/db";
import { createServerSupabase } from "@/lib/supabase/server";

/** How many of the caller's transactions carry a tag, split lines included (R4 FR-021), for the delete confirmation. */
export async function tagUsage(tagId: unknown): Promise<number | null> {
  const id = z.uuid().safeParse(tagId);
  if (!id.success) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return (await searchTransactions(supabase, { tagId: id.data }, null, 1)).count;
}
