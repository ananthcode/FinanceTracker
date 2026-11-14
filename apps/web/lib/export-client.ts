"use client";

import {
  attachmentFilePath,
  backupCounts,
  backupFromPull,
  encryptWithKey,
  exportFileName,
  exportTables,
  lockBackupText,
  toCsv,
  toXlsx,
  transactionIdsInRange,
  zip,
  type BackupFile,
  type DateRange,
  type NumberFormat,
  type ZipEntry,
} from "@ft/core";
import { apiFetch } from "@/lib/api/client";

/**
 * Exports made in the browser (R10-01): every record through the sync pull, the files built by core, then
 * downloaded. Nothing is stored on a server; only a record that an export happened is sent (R10-07).
 */

export type ExportFormat = "backup" | "xlsx" | "csv";

export interface ExportOptions {
  format: ExportFormat;
  range: DateRange | null;
  files: boolean;
  password: string | null;
  today: string;
  numberFormat: NumberFormat;
}

export type Progress = (text: string) => void;

const enc = new TextEncoder();

/** Every record of the user (all pages of the pull) and their preferences. */
export async function readEverything(progress: Progress): Promise<BackupFile> {
  const rows: Record<string, Record<string, unknown>[]> = {};
  let cursor = "0";
  let seen = 0;
  for (let page = 0; page < 2_000; page++) {
    const res = await apiFetch<{ cursor: string; hasMore: boolean; rows: Record<string, Record<string, unknown>[]> }>(`/api/sync/pull?cursor=${cursor}`);
    if (!res.ok || !res.data) throw new Error(res.error?.message ?? "Your records could not be read.");
    for (const [entity, list] of Object.entries(res.data.rows)) {
      (rows[entity] ??= []).push(...list);
      seen += list.length;
    }
    progress(`Reading your records… ${seen.toLocaleString("en-IN")} so far.`);
    cursor = res.data.cursor;
    if (!res.data.hasMore) break;
  }
  const me = await apiFetch<{ preferences: Record<string, unknown> & { baseCurrency: string } }>("/api/me");
  if (!me.ok || !me.data) throw new Error("Your preferences could not be read.");
  const { baseCurrency, ...preferences } = me.data.preferences;
  return backupFromPull({ rows, baseCurrency, preferences, exportedAt: new Date().toISOString() });
}

/** One attachment's bytes through its short-lived link (R9). */
async function fileBytes(id: string): Promise<Uint8Array> {
  const res = await fetch(`/api/attachments/${id}`);
  if (!res.ok) throw new Error("An attachment could not be read. Try again, or export without attachments.");
  return new Uint8Array(await res.arrayBuffer());
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  counts: Record<string, number>;
}

/** Builds the chosen export (FR-001 – FR-009, FR-018). */
export async function buildExport(options: ExportOptions, progress: Progress): Promise<ExportResult> {
  const backup = await readEverything(progress);
  const range = options.format === "backup" ? null : options.range;
  const inRange = transactionIdsInRange(backup, range);
  const attachments = options.files ? backup.records.attachment.filter((a) => inRange.has(String(a.transactionId))) : [];
  const dateOf = new Map(backup.records.transaction.map((t) => [t.id, String(t.date)]));
  const paths = new Map(attachments.map((a, i) => [a.id, attachmentFilePath(i + 1, dateOf.get(String(a.transactionId)) ?? null, String(a.name))]));
  const counts = backupCounts(backup);

  if (options.format === "backup") {
    // A locked backup does not give file names away: they are inside the encrypted backup.
    backup.files = attachments.map((a, i) => ({
      attachmentId: a.id,
      path: options.password ? `attachments/${String(i + 1).padStart(3, "0")}.bin` : paths.get(a.id)!,
    }));
    let text = JSON.stringify(backup);
    let key: Awaited<ReturnType<typeof lockBackupText>>["key"] | null = null;
    if (options.password) {
      progress("Locking the backup…");
      ({ text, key } = await lockBackupText(text, options.password));
    }
    if (attachments.length === 0) {
      return { blob: new Blob([text], { type: "application/json" }), fileName: exportFileName("backup", options.today), counts };
    }
    const entries: ZipEntry[] = [{ name: "backup.json", bytes: enc.encode(text) }];
    for (const [i, a] of attachments.entries()) {
      progress(`Adding attachments… ${i + 1} of ${attachments.length}.`);
      const bytes = await fileBytes(a.id);
      entries.push({ name: backup.files[i]!.path, bytes: key ? await encryptWithKey(key, bytes) : bytes });
    }
    return { blob: new Blob([zip(entries) as Uint8Array<ArrayBuffer>], { type: "application/zip" }), fileName: exportFileName("backup", options.today, { zipped: true }), counts };
  }

  progress("Writing the tables…");
  const tables = exportTables(backup, { range, filePaths: paths });
  const files: ZipEntry[] = [];
  for (const [i, a] of attachments.entries()) {
    progress(`Adding attachments… ${i + 1} of ${attachments.length}.`);
    files.push({ name: paths.get(a.id)!, bytes: await fileBytes(a.id) });
  }
  if (options.format === "xlsx") {
    const book = toXlsx(tables, { numberFormat: options.numberFormat });
    if (files.length === 0) {
      return {
        blob: new Blob([book as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        fileName: exportFileName("xlsx", options.today, { range }),
        counts,
      };
    }
    const name = exportFileName("xlsx", options.today, { range });
    return {
      blob: new Blob([zip([{ name, bytes: book }, ...files]) as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
      fileName: exportFileName("xlsx", options.today, { range, zipped: true }),
      counts,
    };
  }
  const csvs = tables.map((t) => ({ name: `${t.file}.csv`, bytes: enc.encode(toCsv(t)) }));
  return {
    blob: new Blob([zip([...csvs, ...files]) as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
    fileName: exportFileName("csv", options.today, { range }),
    counts,
  };
}

/** Saves the file through the browser. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Records that an export happened (counts only, R10-07). Failure does not stop the download. */
export async function logExport(options: ExportOptions, counts: Record<string, number>): Promise<void> {
  await apiFetch("/api/me/export-log", {
    body: { format: options.format, counts, range: options.format === "backup" ? null : options.range, files: options.files, locked: options.password !== null },
  });
}
