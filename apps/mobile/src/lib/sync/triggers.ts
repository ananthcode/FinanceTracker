/**
 * When the phone syncs (R2 T061, research R2-15): when connectivity returns, when the app comes
 * to the foreground, 2 s after a local change while online, and every 5 minutes while online.
 * Push then pull each time (SyncEngine.sync).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useOffline } from "../connectivity";
import type { SyncEngine } from "./engine";

export const AFTER_CHANGE_MS = 2000;
export const PERIODIC_MS = 5 * 60 * 1000;

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastError: string | null;
}

/**
 * Runs the sync triggers for an engine and reports the outbox size. `changed()` is called by
 * screens after recording a change: it refreshes the count and schedules a sync in 2 s.
 */
export function useSyncTriggers(
  engine: SyncEngine | null,
  pendingCount: () => Promise<number>,
): SyncStatus & { changed: () => void; syncNow: () => Promise<void> } {
  const offline = useOffline();
  const [status, setStatus] = useState<SyncStatus>({ pending: 0, syncing: false, lastError: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const pending = await pendingCount();
    setStatus((s) => ({ ...s, pending }));
  }, [pendingCount]);

  const syncNow = useCallback(async () => {
    if (!engine || offline) return;
    setStatus((s) => ({ ...s, syncing: true }));
    const outcome = await engine.sync();
    const pending = await pendingCount();
    setStatus({ pending, syncing: false, lastError: outcome.ok ? null : (outcome.error ?? "Sync failed") });
  }, [engine, offline, pendingCount]);

  const changed = useCallback(() => {
    void refresh();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), AFTER_CHANGE_MS);
  }, [refresh, syncNow]);

  // Connectivity regained (and first start while online).
  useEffect(() => {
    if (offline !== false) return;
    const id = setTimeout(() => void syncNow(), 0);
    return () => clearTimeout(id);
  }, [offline, syncNow]);

  // App back in the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  // Every 5 minutes while online.
  useEffect(() => {
    if (offline !== false) return;
    const id = setInterval(() => void syncNow(), PERIODIC_MS);
    return () => clearInterval(id);
  }, [offline, syncNow]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { ...status, changed, syncNow };
}
