import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttachmentType, AttachmentUsage, AttachmentView } from "@ft/core";

/**
 * Attachments read repository (R9 T005). Use the caller's client: RLS select-own applies to the records,
 * and the storage policies to the files. Nothing here logs names or contents.
 */

type Raw = Record<string, unknown>;

export const ATTACHMENTS_BUCKET = "attachments";

/** The object name of an attachment's file: `<user>/<attachment>`. */
export const attachmentPath = (userId: string, attachmentId: string) => `${userId}/${attachmentId}`;

export function attachmentFromRow(r: Raw): AttachmentView {
  return {
    id: r.id as string,
    transactionId: r.transaction_id as string,
    name: r.name as string,
    contentType: r.content_type as AttachmentType,
    sizeBytes: Number(r.size_bytes),
    createdAt: r.created_at as string,
  };
}

const COLUMNS = "id, transaction_id, name, content_type, size_bytes, created_at";

/** A transaction's live attachments, oldest first. */
export async function listAttachments(db: SupabaseClient, transactionId: string): Promise<AttachmentView[]> {
  const { data, error } = await db
    .from("attachments")
    .select(COLUMNS)
    .eq("transaction_id", transactionId)
    .eq("state", "active")
    .order("created_at")
    .order("id");
  if (error) throw new Error(`ATTACHMENTS_READ_FAILED: ${error.code ?? ""}`);
  return (data as Raw[]).map(attachmentFromRow);
}

/** Which of these transactions have a live attachment (the Warranties list says "receipt attached"). */
export async function transactionsWithAttachments(db: SupabaseClient, transactionIds: string[]): Promise<Set<string>> {
  if (transactionIds.length === 0) return new Set();
  const { data, error } = await db
    .from("attachments")
    .select("transaction_id")
    .in("transaction_id", transactionIds)
    .eq("state", "active");
  if (error) throw new Error(`ATTACHMENTS_READ_FAILED: ${error.code ?? ""}`);
  return new Set((data as { transaction_id: string }[]).map((r) => r.transaction_id));
}

/** The caller's stored files and bytes against the allowance (clarify Q1). */
export async function attachmentUsage(db: SupabaseClient): Promise<AttachmentUsage> {
  const { data, error } = await db.schema("app").rpc("my_attachment_usage");
  if (error) throw new Error(`ATTACHMENT_USAGE_FAILED: ${error.code ?? ""}`);
  const raw = data as { files: number; bytes: string; allowance: string };
  return { files: Number(raw.files), bytes: BigInt(raw.bytes), allowance: BigInt(raw.allowance) };
}

/** The caller's files no live record needs (deleted ones, abandoned uploads); research R9-03. */
export async function orphanAttachmentFiles(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.schema("app").rpc("my_orphan_attachment_files");
  if (error) throw new Error(`ATTACHMENT_ORPHANS_FAILED: ${error.code ?? ""}`);
  return (data as string[] | null) ?? [];
}

/**
 * Removes every file in a user's folder (but the attachment ids in `keep`). Server only, with the service
 * role (data reset and erasure, research R9-03). Returns how many were removed.
 */
export async function removeUserAttachmentFiles(service: SupabaseClient, userId: string, keep: ReadonlySet<string> = new Set()): Promise<number> {
  const bucket = service.storage.from(ATTACHMENTS_BUCKET);
  let removed = 0;
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(userId, { limit: 1000 });
    if (error) throw new Error("ATTACHMENT_FILES_LIST_FAILED");
    const names = (data ?? []).filter((o) => o.id !== null && !keep.has(o.name)).map((o) => `${userId}/${o.name}`);
    if (names.length === 0) return removed;
    const { error: removeError } = await bucket.remove(names);
    if (removeError) throw new Error("ATTACHMENT_FILES_REMOVE_FAILED");
    removed += names.length;
  }
  throw new Error("ATTACHMENT_FILES_REMOVE_INCOMPLETE");
}
