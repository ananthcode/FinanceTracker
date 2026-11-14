"use client";

import {
  ATTACHMENT_ALLOWANCE,
  backupChanges,
  backupCounts,
  chunked,
  decryptWithKey,
  formatBytes,
  formatHlc,
  IMPORT_HLC_DEVICE,
  isZip,
  MAX_CHANGES_PER_IMPORT_CHUNK,
  readBackup,
  unlockBackup,
  unzip,
  type BackupFile,
  type BackupPlan,
  type ChangeInput,
  type LockedBackup,
  type LockKey,
} from "@ft/core";
import { apiFetch } from "@/lib/api/client";

/**
 * Importing a backup in the browser (R10-05, R10-06): read the file (JSON or zip), unlock it, check it all
 * with core, then send it in parts to an import session; any refusal undoes the whole import (FR-012).
 */

export type Progress = (text: string) => void;

export type ReadFile =
  | { kind: "ready"; backup: BackupFile; files: Map<string, Uint8Array>; key: LockKey | null }
  | { kind: "locked"; locked: LockedBackup; files: Map<string, Uint8Array> }
  | { kind: "problem"; problem: string };

/** Raw deflate through the browser (zips made by other tools). */
async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readBackupFile(file: File): Promise<ReadFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  const files = new Map<string, Uint8Array>();
  if (isZip(bytes)) {
    let entries;
    try {
      entries = await unzip(bytes, inflate);
    } catch {
      return { kind: "problem", problem: "This zip file is damaged." };
    }
    const json = entries.find((e) => e.name === "backup.json");
    if (!json) return { kind: "problem", problem: "This zip has no backup in it (only a backup made by Export › Backup can be imported)." };
    for (const e of entries) if (e.name !== "backup.json") files.set(e.name, e.bytes);
    text = new TextDecoder().decode(json.bytes);
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const read = readBackup(text);
  if (read.kind === "problem") return read;
  if (read.kind === "locked") return { kind: "locked", locked: read.locked, files };
  return { kind: "ready", backup: read.backup, files, key: null };
}

export async function unlockFile(locked: LockedBackup, files: Map<string, Uint8Array>, password: string): Promise<ReadFile> {
  let opened;
  try {
    opened = await unlockBackup(locked, password);
  } catch {
    return { kind: "problem", problem: "The password is not right." };
  }
  const read = readBackup(opened.text);
  if (read.kind !== "plain") return { kind: "problem", problem: read.kind === "problem" ? read.problem : "This backup is damaged." };
  return { kind: "ready", backup: read.backup, files, key: opened.key };
}

export interface Prepared {
  backup: BackupFile;
  plan: BackupPlan;
  counts: Record<string, number>;
  /** Attachment files present in the file, and their total size. */
  fileCount: number;
  fileBytes: number;
}

export function prepare(backup: BackupFile, files: Map<string, Uint8Array>, baseCurrency: string): Prepared | { problems: string[] } {
  if (backup.baseCurrency !== baseCurrency) {
    return { problems: [`This backup's amounts are in ${backup.baseCurrency}; your data uses ${baseCurrency}.`] };
  }
  const plan = backupChanges(backup);
  if (plan.problems.length > 0) return { problems: plan.problems };
  const withFile = backup.files.filter((f) => files.has(f.path));
  const sizeOf = new Map(backup.records.attachment.map((a) => [a.id, Number(a.sizeBytes)]));
  return {
    backup,
    plan,
    counts: backupCounts(backup),
    fileCount: withFile.length,
    fileBytes: withFile.reduce((s, f) => s + (sizeOf.get(f.attachmentId) ?? 0), 0),
  };
}

export const fitsAllowance = (p: Prepared) => BigInt(p.fileBytes) <= ATTACHMENT_ALLOWANCE;
export const allowanceText = (p: Prepared) => `${formatBytes(p.fileBytes)} of attachments; the allowance is ${formatBytes(ATTACHMENT_ALLOWANCE)}`;

async function call<T>(body: unknown): Promise<T> {
  const res = await apiFetch<T>("/api/me/import", { body });
  if (!res.ok || !res.data) throw new Error(res.error?.message ?? "The import did not finish.");
  return res.data;
}

/** Uploads one restored file with the R9 one-time link; returns the new attachment id. */
async function uploadFile(transactionId: string, contentType: string, bytes: Uint8Array): Promise<string> {
  const link = await apiFetch<{ id: string; uploadUrl: string }>("/api/attachments", { body: { transactionId, contentType, sizeBytes: bytes.length } });
  if (!link.ok || !link.data) throw new Error(link.error?.message ?? "An attachment could not be stored.");
  const res = await fetch(link.data.uploadUrl, { method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" }, body: bytes as Uint8Array<ArrayBuffer> });
  if (!res.ok) throw new Error("An attachment could not be stored.");
  return link.data.id;
}

/** The preferences a backup carries that the user may set (R1 / R6 / R7 / R9). */
function preferencesPatch(p: BackupFile["preferences"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["numberFormat", "dateFormat", "fyStartMonth", "timezone", "accountsView", "bufferMinor", "planNudge"] as const) {
    if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
  }
  if (p.planCheckedMonth) out.planCheckedMonth = p.planCheckedMonth;
  if (p.warrantyFirstDays !== undefined) {
    out.warrantyFirstDays = p.warrantyFirstDays;
    out.warrantySecondDays = p.warrantySecondDays ?? null;
  }
  return out;
}

export interface ImportOutcome {
  counts: Record<string, number>;
  filesRestored: number;
  preferencesRestored: boolean;
}

/**
 * Imports a prepared backup: begin (after RESET when asked), the records in parts, the files, finish, then the
 * preferences. Any failure undoes everything imported so far and throws its message.
 */
export async function runImport(
  p: Prepared,
  files: Map<string, Uint8Array>,
  key: LockKey | null,
  options: { reset: boolean; withFiles: boolean },
  progress: Progress,
): Promise<ImportOutcome> {
  const { importId } = await call<{ importId: string }>({ action: "begin", ...(options.reset ? { reset: "RESET" } : {}) });
  try {
    const parts = chunked(p.plan.changes, MAX_CHANGES_PER_IMPORT_CHUNK);
    let done = 0;
    for (const part of parts) {
      await call({ action: "chunk", importId, changes: part });
      done += part.length;
      progress(`Importing… ${done.toLocaleString("en-IN")} of ${p.plan.changes.length.toLocaleString("en-IN")} records.`);
    }
    let filesRestored = 0;
    if (options.withFiles) {
      const pathOf = new Map(p.backup.files.map((f) => [f.attachmentId, f.path]));
      const creates: ChangeInput[] = [];
      for (const a of p.plan.attachments) {
        const path = pathOf.get(a.backupId);
        const stored = path ? files.get(path) : undefined;
        if (!stored) continue;
        progress(`Restoring attachments… ${filesRestored + 1} of ${p.fileCount}.`);
        const bytes = key ? await decryptWithKey(key, stored) : stored;
        const id = await uploadFile(a.transactionId, a.contentType, bytes);
        creates.push({
          changeId: crypto.randomUUID(),
          entity: "attachment",
          entityId: id,
          kind: "create",
          fields: { transactionId: a.transactionId, name: a.name, contentType: a.contentType, sizeBytes: String(bytes.length) },
          hlc: formatHlc({ wall: Date.now(), counter: creates.length, device: IMPORT_HLC_DEVICE }),
        });
        filesRestored++;
      }
      for (const part of chunked(creates, MAX_CHANGES_PER_IMPORT_CHUNK)) await call({ action: "chunk", importId, changes: part });
    }
    const categoriesStart = p.backup.preferences.categoriesStart;
    const { counts } = await call<{ counts: Record<string, number> }>({
      action: "finish",
      importId,
      interest: p.plan.interest,
      categoriesStart: categoriesStart === "suggested" || categoriesStart === "empty" ? categoriesStart : null,
    });
    const patch = preferencesPatch(p.backup.preferences);
    const prefs = Object.keys(patch).length === 0 ? { ok: true } : await apiFetch("/api/me/preferences", { method: "PATCH", body: patch });
    return { counts, filesRestored, preferencesRestored: prefs.ok };
  } catch (err) {
    progress("Undoing the import…");
    await apiFetch("/api/me/import", { body: { action: "abort", importId } });
    throw err;
  }
}

/** Undoes an import that did not finish (the tab was closed): the R5 reset. */
export async function undoOpenImport(importId: string): Promise<boolean> {
  return (await apiFetch("/api/me/import", { body: { action: "abort", importId } })).ok;
}
