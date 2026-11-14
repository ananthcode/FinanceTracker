import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoAttachmentIds, demoReceipt, type ChangeInput } from "@ft/core";
import { ATTACHMENTS_BUCKET, attachmentPath, orphanAttachmentFiles, removeUserAttachmentFiles } from "@ft/db";
import { adminSupabase } from "@/lib/supabase/admin";

/**
 * Server side of attachment files (research R9-03). Files are removed only through the Storage API:
 * the caller's own client for their orphans (storage policies apply), the service role for a whole
 * folder on data reset and erasure, and for the demo receipt. Names and contents are never logged.
 */

/** Removes the caller's files that no live record needs. Returns how many were removed. */
export async function removeMyOrphanFiles(db: SupabaseClient): Promise<number> {
  const names = await orphanAttachmentFiles(db);
  if (names.length === 0) return 0;
  const { error } = await db.storage.from(ATTACHMENTS_BUCKET).remove(names);
  if (error) throw new Error("ATTACHMENT_FILES_REMOVE_FAILED");
  return names.length;
}

/** Removes every file of a user (data reset, erasure), but the attachment ids in `keep`. */
export function removeAllFilesOf(userId: string, keep: readonly string[] = []): Promise<number> {
  return removeUserAttachmentFiles(adminSupabase(), userId, new Set(keep));
}

/**
 * Stores the demo receipt's file for the attachment change in a demo load (R9 FR-014), before the load
 * records it. Returns the stored attachment ids, to remove again if the load fails.
 */
export async function storeDemoFiles(userId: string, changes: readonly ChangeInput[], todayIso: string): Promise<string[]> {
  const ids = demoAttachmentIds(changes);
  const receipt = demoReceipt(todayIso);
  if (ids.length === 0 || !receipt) return [];
  const bucket = adminSupabase().storage.from(ATTACHMENTS_BUCKET);
  for (const id of ids) {
    const { error } = await bucket.upload(attachmentPath(userId, id), receipt.bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error("DEMO_FILE_UPLOAD_FAILED");
  }
  return ids;
}

/** Removes the given attachment files of a user (a failed demo load). */
export async function removeFilesOf(userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await adminSupabase().storage.from(ATTACHMENTS_BUCKET).remove(ids.map((id) => attachmentPath(userId, id)));
}
