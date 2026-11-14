/**
 * The backup file (R10-02): a complete, versioned copy of one user's records, made from the sync pull's
 * wire rows (camelCase, money as decimal strings of paise). Only live records; no sequence numbers, field
 * versions or user ids. Interest proposals keep their marks so a restore does not duplicate them (R10-05).
 */
import { z } from "zod";

export const BACKUP_FORMAT = "finance-tracker-backup";
export const BACKUP_VERSION = 1;

/** The record types a backup holds, in restore order. */
export const BACKUP_ENTITIES = [
  "account_group",
  "account",
  "category",
  "tag",
  "payee",
  "person_rate",
  "plan_item",
  "plan_occurrence",
  "template",
  "transaction",
  "attachment",
] as const;
export type BackupEntity = (typeof BACKUP_ENTITIES)[number];

export type WireRow = { id: string } & Record<string, unknown>;

const Row = z.object({ id: z.uuid() }).loose();
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);

export const BackupPreferences = z
  .object({
    numberFormat: z.string().optional(),
    dateFormat: z.string().optional(),
    fyStartMonth: z.number().optional(),
    timezone: z.string().optional(),
    accountsView: z.string().optional(),
    categoriesStart: z.string().nullable().optional(),
    bufferMinor: z.string().optional(),
    planNudge: z.boolean().optional(),
    planCheckedMonth: z.string().nullable().optional(),
    warrantyFirstDays: z.number().optional(),
    warrantySecondDays: z.number().nullable().optional(),
  })
  .loose();

export const BackupFile = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    exportedAt: z.string(),
    appVersion: z.string().optional(),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    preferences: BackupPreferences,
    records: z
      .object(Object.fromEntries(BACKUP_ENTITIES.map((e) => [e, z.array(Row).default([])])) as Record<BackupEntity, z.ZodDefault<z.ZodArray<typeof Row>>>)
      .strict(),
    /** Interest proposals the user deleted: the proposer must not make them again. */
    declinedInterest: z.array(z.object({ payeeId: z.uuid(), month: Month }).strict()).default([]),
    /** With attachment files (a zip): which file holds which attachment. */
    files: z.array(z.object({ attachmentId: z.uuid(), path: z.string().min(1).max(300) }).strict()).default([]),
  })
  .strict();
export type BackupFile = z.output<typeof BackupFile>;

/** A locked backup (R10-04): the plain backup's JSON, encrypted. */
export const LockedBackup = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    locked: z.object({ kdf: z.literal("PBKDF2-SHA-256"), iterations: z.number().int().min(100_000).max(10_000_000), salt: z.string(), iv: z.string() }).strict(),
    data: z.string(),
  })
  .strict();
export type LockedBackup = z.output<typeof LockedBackup>;

const DROPPED = new Set(["serverSeq", "fieldVersions", "userId", "deletedAt", "updatedAt", "mergedInto", "archivedAt"]);

function clean(row: Record<string, unknown>): WireRow {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !DROPPED.has(k))) as WireRow;
}

export interface BackupSource {
  rows: Partial<Record<BackupEntity | string, Record<string, unknown>[]>>;
  baseCurrency: string;
  preferences: Record<string, unknown>;
  exportedAt: string;
  appVersion?: string;
}

/** The backup from everything the pull returned (all pages merged; the latest row per id wins). */
export function backupFromPull(source: BackupSource): BackupFile {
  const records = {} as Record<BackupEntity, WireRow[]>;
  const declinedInterest: { payeeId: string; month: string }[] = [];
  for (const entity of BACKUP_ENTITIES) {
    const latest = new Map<string, Record<string, unknown>>();
    for (const r of source.rows[entity] ?? []) latest.set(String(r.id), r);
    const live: WireRow[] = [];
    for (const r of latest.values()) {
      if (r.state === "deleted") {
        if (entity === "transaction" && r.generated === true && typeof r.interestMonth === "string" && typeof r.payeeId === "string") {
          declinedInterest.push({ payeeId: r.payeeId, month: r.interestMonth });
        }
        continue;
      }
      live.push(clean(r));
    }
    records[entity] = live;
  }
  const { categoriesStart, ...prefs } = source.preferences;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: source.exportedAt,
    ...(source.appVersion ? { appVersion: source.appVersion } : {}),
    baseCurrency: source.baseCurrency,
    preferences: { ...prefs, categoriesStart: (categoriesStart as string | null | undefined) ?? null } as BackupFile["preferences"],
    records,
    declinedInterest,
    files: [],
  };
}

export type ReadResult =
  | { kind: "plain"; backup: BackupFile }
  | { kind: "locked"; locked: LockedBackup }
  | { kind: "problem"; problem: string };

/** Reads a backup's JSON text: plain, locked, or what is wrong with it (in words). */
export function readBackup(text: string): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: "problem", problem: "This file is not a backup of this app (it is not readable as one)." };
  }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { kind: "problem", problem: "This file is not a backup of this app." };
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version === "number" && version > BACKUP_VERSION) {
    return { kind: "problem", problem: "This backup was made by a newer version of the app. Update the app first." };
  }
  if ("locked" in raw) {
    const locked = LockedBackup.safeParse(raw);
    return locked.success ? { kind: "locked", locked: locked.data } : { kind: "problem", problem: "This locked backup is damaged." };
  }
  const parsed = BackupFile.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { kind: "problem", problem: `This backup is damaged or incomplete (${issue ? issue.path.join(".") || issue.message : "unknown"}).` };
  }
  return { kind: "plain", backup: parsed.data };
}

/** Counts by record type, for "what this backup contains". */
export function backupCounts(backup: BackupFile): Record<BackupEntity, number> {
  return Object.fromEntries(BACKUP_ENTITIES.map((e) => [e, backup.records[e].length])) as Record<BackupEntity, number>;
}
