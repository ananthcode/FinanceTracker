/**
 * The Android sync engine (R2 T061, research R2-01, R2-15; contracts/sync-protocol.md).
 *
 * Every local change is applied to the device store and queued in the outbox in one transaction,
 * so the screen updates at once and nothing is lost offline. `sync()` pushes the outbox in order
 * (each change carries its own id, so a retried push is applied exactly once by the server), then
 * pulls everything changed since the cursor. A pulled row replaces the local one, and any change
 * still waiting in the outbox for that row is re-applied on top, so offline edits are never hidden
 * by a pull. Pure TypeScript: no React Native imports, so it runs under Jest with a fake server.
 */
import {
  formatHlc,
  MAX_CHANGES_PER_PUSH,
  nextHlc,
  observeHlc,
  parseHlc,
  SYNC_ENTITIES,
  type ChangeInput,
  type HlcParts,
  type SyncEntity,
} from "@ft/core";
import type { SyncRow, SyncStore, SyncTransport } from "./types";

const STATE_CURSOR = "cursor";
const STATE_HLC = "hlc";

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  /** False when the network failed; the outbox is kept for the next attempt. */
  ok: boolean;
  error?: string;
}

export class SyncEngine {
  private running: Promise<SyncOutcome> | null = null;

  constructor(
    private readonly store: SyncStore,
    private readonly transport: SyncTransport,
    private readonly deviceId: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** The next HLC for a change made on this device now (contracts/sync-protocol.md §HLC). */
  async nextHlc(): Promise<string> {
    const stored = await this.store.getState(STATE_HLC);
    const last: HlcParts | null = stored ? parseHlc(stored) : null;
    const next = formatHlc(nextHlc(last && last.device === this.deviceId ? last : null, this.now(), this.deviceId));
    await this.store.setState(STATE_HLC, next);
    return next;
  }

  /**
   * Records a change made on this phone: applied locally and queued, in one transaction.
   * `change` has no id or HLC yet; both are assigned here.
   */
  async record(change: Omit<ChangeInput, "changeId" | "hlc">): Promise<ChangeInput> {
    return this.store.transaction(async () => {
      const full = { ...change, changeId: randomId(), hlc: await this.nextHlc() } as ChangeInput;
      const row = await this.store.getRow(full.entity, full.entityId);
      await this.store.putRow(full.entity, applyLocally(row, full));
      await this.store.enqueue({ change: full, createdAt: this.now(), attempts: 0, lastError: null });
      return full;
    });
  }

  /** Push then pull. Concurrent calls share one run. */
  sync(): Promise<SyncOutcome> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<SyncOutcome> {
    let pushed = 0;
    try {
      pushed = await this.push();
    } catch (err) {
      return { pushed, pulled: 0, ok: false, error: message(err) };
    }
    try {
      const pulled = await this.pull();
      return { pushed, pulled, ok: true };
    } catch (err) {
      return { pushed, pulled: 0, ok: false, error: message(err) };
    }
  }

  private async push(): Promise<number> {
    let pushed = 0;
    for (;;) {
      const batch = await this.store.pending(MAX_CHANGES_PER_PUSH);
      if (batch.length === 0) return pushed;
      const ids = batch.map((p) => p.change.changeId);
      let results;
      try {
        results = await this.transport.push({ device: "android", changes: batch.map((p) => p.change) });
      } catch (err) {
        // Network or server failure: keep the whole batch for the next attempt (idempotent ids).
        await this.store.markFailed(ids, message(err));
        throw err;
      }
      await this.store.transaction(async () => {
        for (const [i, result] of results.entries()) {
          const pending = batch[i]!.change;
          if (result.status === "renamed" || result.status === "converted" || result.status === "rejected") {
            await this.store.addNotice({
              changeId: result.changeId,
              entity: pending.entity,
              entityId: pending.entityId,
              status: result.status,
              ...(result.renamedTo ? { renamedTo: result.renamedTo } : {}),
              ...(result.code ? { code: result.code } : {}),
              at: this.now(),
            });
          }
        }
        // Every answered change leaves the outbox; a refused one is restored by the next pull.
        await this.store.removePending(ids);
      });
      pushed += batch.length;
    }
  }

  private async pull(): Promise<number> {
    let pulled = 0;
    let cursor = (await this.store.getState(STATE_CURSOR)) ?? "0";
    for (;;) {
      const page = await this.transport.pull(cursor);
      await this.store.transaction(async () => {
        const waiting = await this.store.pending();
        let seen: HlcParts | null = null;
        for (const entity of SYNC_ENTITIES) {
          for (const row of (page.rows[entity] ?? []) as SyncRow[]) {
            let merged: SyncRow = row;
            // Re-apply changes still waiting to be sent, so the user keeps seeing their edit.
            for (const p of waiting) {
              if (p.change.entity === entity && p.change.entityId === row.id) merged = applyLocally(merged, p.change);
            }
            await this.store.putRow(entity, merged);
            for (const version of Object.values((row.fieldVersions ?? {}) as Record<string, string>)) {
              const parts = parseHlc(version);
              seen = seen ? observeHlc(seen, parts) : parts;
            }
            pulled += 1;
          }
        }
        // Never let this device's clock fall behind versions it has seen (R2-02).
        if (seen) {
          const stored = await this.store.getState(STATE_HLC);
          const local = stored ? parseHlc(stored) : null;
          const next = observeHlc(local, seen);
          await this.store.setState(STATE_HLC, formatHlc({ ...next, device: this.deviceId }));
        }
        await this.store.setState(STATE_CURSOR, page.cursor);
      });
      cursor = page.cursor;
      if (!page.hasMore) return pulled;
    }
  }
}

/** What a change looks like on the device before the server has answered (optimistic). */
export function applyLocally(row: SyncRow | null, change: ChangeInput): SyncRow {
  const base: SyncRow = row ?? { id: change.entityId, state: "active", fieldVersions: {} };
  const versions = { ...((base.fieldVersions ?? {}) as Record<string, string>) };
  const fields = (change.fields ?? {}) as Record<string, unknown>;
  switch (change.kind) {
    case "create":
    case "update":
      for (const key of Object.keys(fields)) versions[key] = change.hlc;
      return { ...base, ...fields, id: change.entityId, fieldVersions: versions };
    case "archive":
      return { ...base, state: "archived", fieldVersions: { ...versions, state: change.hlc } };
    case "restore":
      return { ...base, state: "active", fieldVersions: { ...versions, state: change.hlc } };
    case "delete":
      return { ...base, state: "deleted", fieldVersions: { ...versions, state: change.hlc } };
    case "merge":
      // The server moves children and references; the next pull brings them.
      return { ...base, state: "deleted", mergedInto: fields.targetId, fieldVersions: { ...versions, state: change.hlc } };
  }
}

/** Live (not deleted) rows of one entity, for screens. */
export async function liveRows(store: SyncStore, entity: SyncEntity): Promise<SyncRow[]> {
  return (await store.listRows(entity)).filter((r) => r.state !== "deleted");
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
