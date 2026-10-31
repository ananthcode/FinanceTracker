import type { ChangeInput, ChangeResult, PullResponse, SyncEntity } from "@ft/core";

/** A push body as sent (before the server's schema fills defaults). */
export interface PushInput {
  device: "web" | "android";
  changes: ChangeInput[];
}

/** A synced row as the server sends it on pull: camelCase, money as decimal strings. */
export type SyncRow = Record<string, unknown> & { id: string };

/** A change saved on the phone and not yet accepted by the server (outbox, research R2-15). */
export interface PendingChange {
  change: ChangeInput;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

/** Something the user must be told about after a push (FR-032, FR-034). */
export interface SyncNotice {
  changeId: string;
  entity: SyncEntity;
  entityId: string;
  status: "renamed" | "converted" | "rejected";
  renamedTo?: string;
  code?: string;
  at: number;
}

/**
 * The device store one signed-in user's data lives in (expo-sqlite in the app, memory in tests).
 * A local write and its outbox entry are saved in one transaction (constitution IV).
 */
export interface SyncStore {
  transaction<T>(work: () => Promise<T>): Promise<T>;
  getRow(entity: SyncEntity, id: string): Promise<SyncRow | null>;
  putRow(entity: SyncEntity, row: SyncRow): Promise<void>;
  listRows(entity: SyncEntity): Promise<SyncRow[]>;
  enqueue(pending: PendingChange): Promise<void>;
  /** Unsent changes, oldest first. */
  pending(limit?: number): Promise<PendingChange[]>;
  pendingCount(): Promise<number>;
  removePending(changeIds: readonly string[]): Promise<void>;
  markFailed(changeIds: readonly string[], error: string): Promise<void>;
  getState(key: string): Promise<string | null>;
  setState(key: string, value: string): Promise<void>;
  addNotice(notice: SyncNotice): Promise<void>;
  notices(): Promise<SyncNotice[]>;
  clearNotices(): Promise<void>;
  /** Removes everything except unsent changes (5 wrong PINs, FR-028 / R-09). */
  wipeExceptPending(): Promise<void>;
  /** Removes everything (explicit discard, erasure). */
  wipeAll(): Promise<void>;
}

/** How the engine reaches the server (`/api/sync/push`, `/api/sync/pull`). */
export interface SyncTransport {
  push(request: PushInput): Promise<ChangeResult[]>;
  pull(cursor: string): Promise<PullResponse>;
}
