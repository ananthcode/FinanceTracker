import type { SyncEntity } from "@ft/core";
import type { PendingChange, SyncNotice, SyncRow, SyncStore } from "./types";

/**
 * An in-memory SyncStore with the same behaviour as the SQLite one (tests; and a fallback where
 * SQLite is unavailable). Transactions snapshot the state and roll it back on error.
 */
export class MemorySyncStore implements SyncStore {
  private rows = new Map<string, SyncRow>();
  private outbox: PendingChange[] = [];
  private state = new Map<string, string>();
  private noticeList: SyncNotice[] = [];

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    const snapshot = {
      rows: new Map(this.rows),
      outbox: [...this.outbox],
      state: new Map(this.state),
      noticeList: [...this.noticeList],
    };
    try {
      return await work();
    } catch (err) {
      Object.assign(this, snapshot);
      throw err;
    }
  }

  async getRow(entity: SyncEntity, id: string) {
    return this.rows.get(`${entity}:${id}`) ?? null;
  }
  async putRow(entity: SyncEntity, row: SyncRow) {
    this.rows.set(`${entity}:${row.id}`, row);
  }
  async listRows(entity: SyncEntity) {
    return [...this.rows.entries()].filter(([k]) => k.startsWith(`${entity}:`)).map(([, v]) => v);
  }
  async enqueue(pending: PendingChange) {
    this.outbox.push(pending);
  }
  async pending(limit?: number) {
    return limit === undefined ? [...this.outbox] : this.outbox.slice(0, limit);
  }
  async pendingCount() {
    return this.outbox.length;
  }
  async removePending(changeIds: readonly string[]) {
    const gone = new Set(changeIds);
    this.outbox = this.outbox.filter((p) => !gone.has(p.change.changeId));
  }
  async markFailed(changeIds: readonly string[], error: string) {
    const failed = new Set(changeIds);
    this.outbox = this.outbox.map((p) => (failed.has(p.change.changeId) ? { ...p, attempts: p.attempts + 1, lastError: error } : p));
  }
  async getState(key: string) {
    return this.state.get(key) ?? null;
  }
  async setState(key: string, value: string) {
    this.state.set(key, value);
  }
  async addNotice(notice: SyncNotice) {
    this.noticeList.push(notice);
  }
  async notices() {
    return [...this.noticeList];
  }
  async clearNotices() {
    this.noticeList = [];
  }
  async wipeExceptPending() {
    this.rows.clear();
    this.state.clear();
    this.noticeList = [];
  }
  async wipeAll() {
    await this.wipeExceptPending();
    this.outbox = [];
  }
}
