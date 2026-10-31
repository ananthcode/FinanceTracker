/**
 * The on-device store for one signed-in user (R2 T060, research R2-15): an expo-sqlite database
 * per user holding the synced rows, the outbox of unsent changes, the sync cursor and clock, and
 * notices for the user. Rows are stored as JSON documents keyed by (entity, id): every synced
 * entity (R2 accounts and groups, R3 categories, tags and payees, R4 onward) shares one table, so a
 * new module needs no device migration. Same behaviour as MemorySyncStore (tested there).
 */
import * as SQLite from "expo-sqlite";
import type { SyncEntity } from "@ft/core";
import type { PendingChange, SyncNotice, SyncRow, SyncStore } from "./types";

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sync_rows (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (entity, id)
  );
  CREATE TABLE IF NOT EXISTS pending_changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    change_id TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sync_notices (seq INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
`;

/** Database file per user, so a second user on the same phone never sees the first one's data. */
export function databaseName(userId: string): string {
  return `ft-${userId.replace(/[^a-f0-9-]/gi, "")}.db`;
}

export class SqliteSyncStore implements SyncStore {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(userId: string): Promise<SqliteSyncStore> {
    const db = await SQLite.openDatabaseAsync(databaseName(userId));
    await db.execAsync(SCHEMA);
    return new SqliteSyncStore(db);
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    let result!: T;
    await this.db.withTransactionAsync(async () => {
      result = await work();
    });
    return result;
  }

  async getRow(entity: SyncEntity, id: string) {
    const row = await this.db.getFirstAsync<{ data: string }>("SELECT data FROM sync_rows WHERE entity = ? AND id = ?", entity, id);
    return row ? (JSON.parse(row.data) as SyncRow) : null;
  }

  async putRow(entity: SyncEntity, row: SyncRow) {
    await this.db.runAsync(
      "INSERT INTO sync_rows (entity, id, data) VALUES (?, ?, ?) ON CONFLICT (entity, id) DO UPDATE SET data = excluded.data",
      entity,
      row.id,
      JSON.stringify(row),
    );
  }

  async listRows(entity: SyncEntity) {
    const rows = await this.db.getAllAsync<{ data: string }>("SELECT data FROM sync_rows WHERE entity = ?", entity);
    return rows.map((r) => JSON.parse(r.data) as SyncRow);
  }

  async enqueue(pending: PendingChange) {
    await this.db.runAsync(
      "INSERT INTO pending_changes (change_id, data, created_at, attempts, last_error) VALUES (?, ?, ?, ?, ?)",
      pending.change.changeId,
      JSON.stringify(pending.change),
      pending.createdAt,
      pending.attempts,
      pending.lastError,
    );
  }

  async pending(limit?: number) {
    const rows = await this.db.getAllAsync<{ data: string; created_at: number; attempts: number; last_error: string | null }>(
      `SELECT data, created_at, attempts, last_error FROM pending_changes ORDER BY seq${limit === undefined ? "" : " LIMIT ?"}`,
      ...(limit === undefined ? [] : [limit]),
    );
    return rows.map((r) => ({ change: JSON.parse(r.data), createdAt: r.created_at, attempts: r.attempts, lastError: r.last_error }));
  }

  async pendingCount() {
    return (await this.db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM pending_changes"))?.n ?? 0;
  }

  async removePending(changeIds: readonly string[]) {
    for (const id of changeIds) await this.db.runAsync("DELETE FROM pending_changes WHERE change_id = ?", id);
  }

  async markFailed(changeIds: readonly string[], error: string) {
    for (const id of changeIds) {
      await this.db.runAsync("UPDATE pending_changes SET attempts = attempts + 1, last_error = ? WHERE change_id = ?", error, id);
    }
  }

  async getState(key: string) {
    return (await this.db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key = ?", key))?.value ?? null;
  }

  async setState(key: string, value: string) {
    await this.db.runAsync(
      "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  async addNotice(notice: SyncNotice) {
    await this.db.runAsync("INSERT INTO sync_notices (data) VALUES (?)", JSON.stringify(notice));
  }

  async notices() {
    return (await this.db.getAllAsync<{ data: string }>("SELECT data FROM sync_notices ORDER BY seq")).map((r) => JSON.parse(r.data) as SyncNotice);
  }

  async clearNotices() {
    await this.db.runAsync("DELETE FROM sync_notices");
  }

  async wipeExceptPending() {
    await this.db.execAsync("DELETE FROM sync_rows; DELETE FROM sync_state; DELETE FROM sync_notices;");
  }

  async wipeAll() {
    await this.wipeExceptPending();
    await this.db.runAsync("DELETE FROM pending_changes");
  }
}
