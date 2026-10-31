import type { SupabaseClient } from "@supabase/supabase-js";
import { ChangeResult, SYNC_ENTITIES, type PullResponse, type PushRequest, type SyncEntity } from "@ft/core";

/**
 * Sync RPC wrappers (T030, contracts/sync-protocol.md). Call with the user's own client so
 * app.apply_changes / app.pull_changes act as that user.
 */

/** Thrown when the database reports the caller is no longer an active user. */
export class SyncUserInactiveError extends Error {
  constructor() {
    super("USER_INACTIVE");
    this.name = "SyncUserInactiveError";
  }
}

function raise(prefix: string, message: string): never {
  if (message.includes("USER_INACTIVE")) throw new SyncUserInactiveError();
  // Never include the database message: it may quote values from the payload (FR-028).
  throw new Error(prefix);
}

export async function pushChanges(db: SupabaseClient, request: PushRequest): Promise<ChangeResult[]> {
  const { data, error } = await db.schema("app").rpc("apply_changes", { p_changes: request.changes, p_device: request.device });
  if (error) raise("SYNC_PUSH_FAILED", error.message);
  return ChangeResult.array().parse(data);
}

const MONEY_AND_SEQ = new Set(["opening_balance_minor", "credit_limit_minor", "server_seq"]);

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Database row → wire row: camelCase keys; money and sequence numbers as decimal strings. */
function toWire(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "user_id") continue; // always the caller
    out[camel(key)] = MONEY_AND_SEQ.has(key) && value !== null ? String(value) : value;
  }
  return out;
}

export async function pullChanges(db: SupabaseClient, cursor: string, limit = 500): Promise<PullResponse> {
  const { data, error } = await db.schema("app").rpc("pull_changes", { p_cursor: cursor, p_limit: limit });
  if (error) raise("SYNC_PULL_FAILED", error.message);
  const raw = data as { cursor: string; hasMore: boolean; rows: Record<SyncEntity, Record<string, unknown>[]> };
  const rows = Object.fromEntries(SYNC_ENTITIES.map((entity) => [entity, (raw.rows[entity] ?? []).map(toWire)]));
  return { cursor: raw.cursor, hasMore: raw.hasMore, rows: rows as PullResponse["rows"] };
}
