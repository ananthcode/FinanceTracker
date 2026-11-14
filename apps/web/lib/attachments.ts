"use client";

import { attachmentName, attachmentProblem, formatBytes, pickedKind, type ChangeInput } from "@ft/core";
import { apiFetch } from "@/lib/api/client";
import { compressPhoto } from "@/lib/compress";
import { changes, type PushOutcome } from "@/lib/sync-client";

/**
 * Attaching a file from the browser (research R9-02): check it, make a photo smaller, get a one-time
 * upload link, upload straight to storage, then push the record. If the record is refused, the file is
 * left for the clean-up, which removes it. Nothing about the file is logged.
 */

export type AttachResult = { ok: true; id: string; savedBytes: number | null } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  type: "Only photos (JPEG, PNG, WebP, HEIC) and PDFs can be attached.",
  size: "That file is too big: PDFs can be up to 10 MB.",
  UNREADABLE: "This photo can't be read here. Try a JPEG or PNG copy.",
  LIMIT_REACHED: "A transaction can have 10 attachments. Remove one first.",
  QUOTA_EXCEEDED: "Not enough attachment space. Remove some attachments first.",
  INVALID_ATTACHMENT: "The file was not stored completely. Please try again.",
  NETWORK: "The upload did not finish. Check your connection and try again.",
};

export const attachMessage = (code: string, fallback?: string) => MESSAGES[code] ?? fallback ?? "The file could not be attached. Please try again.";

export async function attachFile(
  transactionId: string,
  file: File,
  push: (list: ChangeInput[]) => Promise<PushOutcome>,
): Promise<AttachResult> {
  const problem = attachmentProblem(file.type, file.name, file.size);
  if (problem) return { ok: false, message: attachMessage(problem) };
  const kind = pickedKind(file.type, file.name)!;

  let blob: Blob = file;
  if (kind === "photo") {
    try {
      blob = await compressPhoto(file);
    } catch {
      return { ok: false, message: attachMessage("UNREADABLE") };
    }
  }
  const contentType = kind === "photo" ? "image/jpeg" : "application/pdf";

  const link = await apiFetch<{ id: string; uploadUrl: string }>("/api/attachments", {
    body: { transactionId, contentType, sizeBytes: blob.size },
  });
  if (!link.ok || !link.data) return { ok: false, message: attachMessage(link.error?.code ?? "", link.error?.message) };

  try {
    const res = await fetch(link.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType, "x-upsert": "false", "cache-control": "max-age=3600" },
      body: blob,
    });
    if (!res.ok) return { ok: false, message: attachMessage(res.status === 413 ? "size" : "INVALID_ATTACHMENT") };
  } catch {
    return { ok: false, message: attachMessage("NETWORK") };
  }

  const outcome = await push([
    changes.createAttachment(link.data.id, {
      transactionId,
      name: attachmentName(file.name, kind),
      contentType,
      sizeBytes: String(blob.size),
    }),
  ]);
  const result = outcome.ok ? outcome.results[0] : undefined;
  if (!outcome.ok || !result || result.status === "rejected") {
    void cleanupAttachmentFiles();
    return { ok: false, message: attachMessage(result?.code ?? (outcome.ok ? "" : outcome.error.code)) };
  }
  return { ok: true, id: link.data.id, savedBytes: kind === "photo" && blob.size < file.size ? file.size - blob.size : null };
}

/** Removes this user's files that no live record needs (after deletes; research R9-03). */
export async function cleanupAttachmentFiles(): Promise<void> {
  await apiFetch("/api/attachments/cleanup", { method: "POST" });
}

/** "Saved 3.6 MB" for a photo made smaller. */
export const savedText = (bytes: number) => `Made smaller: saved ${formatBytes(bytes)}.`;
