import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeInput } from "@ft/core";

/**
 * Backup import sessions and export records (R10, specs/010-data-export/contracts/export-import.md). Use the
 * caller's client: the database functions act for auth.uid() only. Nothing here logs record contents.
 */

type Device = "web" | "android";
export type ImportCounts = Partial<Record<string, number>>;

export class ImportRefused extends Error {
  constructor(
    readonly code: string,
    readonly index: number | null = null,
    readonly changeCode: string | null = null,
  ) {
    super(code);
    this.name = "ImportRefused";
  }
}

function failure(error: { message: string; code?: string }): Error {
  const rejected = /IMPORT_REJECTED:(\d+):([A-Z_]+)/.exec(error.message);
  if (rejected) return new ImportRefused("IMPORT_REJECTED", Number(rejected[1]), rejected[2]!);
  for (const code of ["NOT_EMPTY", "IMPORT_NOT_OPEN", "USER_INACTIVE", "VALIDATION_FAILED"]) {
    if (error.message.includes(code)) return new ImportRefused(code);
  }
  return new Error(`IMPORT_FAILED: ${error.code ?? ""}`);
}

export async function importBegin(db: SupabaseClient, device: Device): Promise<string> {
  const { data, error } = await db.schema("app").rpc("import_begin", { p_device: device });
  if (error) throw failure(error);
  return data as string;
}

export async function importChunk(db: SupabaseClient, importId: string, changes: ChangeInput[]): Promise<number> {
  const { data, error } = await db.schema("app").rpc("import_chunk", { p_import: importId, p_changes: changes });
  if (error) throw failure(error);
  return Number((data as { applied: number }).applied);
}

export interface InterestMarksInput {
  proposals: { transactionId: string; interestMonth: string; userEdited: boolean }[];
  declined: { payeeId: string; month: string }[];
}

export async function importFinish(
  db: SupabaseClient,
  importId: string,
  interest: InterestMarksInput,
  categoriesStart: "suggested" | "empty" | null,
): Promise<ImportCounts> {
  const { data, error } = await db
    .schema("app")
    .rpc("import_finish", { p_import: importId, p_interest: interest, p_categories_start: categoriesStart });
  if (error) throw failure(error);
  return data as ImportCounts;
}

export async function importAbort(db: SupabaseClient, importId: string): Promise<ImportCounts> {
  const { data, error } = await db.schema("app").rpc("import_abort", { p_import: importId });
  if (error) throw failure(error);
  return data as ImportCounts;
}

export async function myOpenImport(db: SupabaseClient): Promise<{ importId: string; startedAt: string } | null> {
  const { data, error } = await db.schema("app").rpc("my_open_import");
  if (error) throw failure(error);
  return (data as { importId: string; startedAt: string } | null) ?? null;
}

export async function logExport(
  db: SupabaseClient,
  entry: { format: "backup" | "xlsx" | "csv"; counts: Record<string, number>; from: string | null; to: string | null; files: boolean; locked: boolean; device: Device },
): Promise<void> {
  const { error } = await db.schema("app").rpc("log_export", {
    p_format: entry.format,
    p_counts: entry.counts,
    p_from: entry.from,
    p_to: entry.to,
    p_files: entry.files,
    p_locked: entry.locked,
    p_device: entry.device,
  });
  if (error) throw failure(error);
}
