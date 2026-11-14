import type { AttachmentType, AttachmentView } from "@ft/core";
import type { SyncRow } from "./types";

/**
 * Synced attachment rows (R9, wire shape) → the shared AttachmentView. The phone lists a transaction's
 * attachments from these; the files themselves are fetched only when opened (Android phase, US4).
 */
export function attachmentFromRow(row: SyncRow): AttachmentView & { state: "active" | "deleted" } {
  return {
    id: row.id,
    transactionId: String(row.transactionId ?? ""),
    name: String(row.name ?? ""),
    contentType: (row.contentType as AttachmentType) ?? "image/jpeg",
    sizeBytes: Number(row.sizeBytes ?? 0),
    createdAt: String(row.createdAt ?? ""),
    state: row.state === "deleted" ? "deleted" : "active",
  };
}
