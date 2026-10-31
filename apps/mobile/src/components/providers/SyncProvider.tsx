import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChangeInput, SyncEntity } from "@ft/core";
import { liveRows, syncFor, type SyncEngine, type SyncNotice, type SyncRow, type SyncStore } from "@/lib/sync";
import { useSyncTriggers, type SyncStatus } from "@/lib/sync/triggers";
import { useSession } from "./SessionProvider";

interface SyncContextValue extends SyncStatus {
  ready: boolean;
  /** Increases whenever local data changed (a recorded change or a finished sync); screens re-read. */
  version: number;
  /** Records a change on this phone: shown at once, sent automatically (FR-030, FR-033). */
  record: (change: Omit<ChangeInput, "changeId" | "hlc">) => Promise<void>;
  /** Live rows of one entity from the device store. */
  rows: (entity: SyncEntity) => Promise<SyncRow[]>;
  /** One row, including archived ones; null when unknown or deleted. */
  row: (entity: SyncEntity, id: string) => Promise<SyncRow | null>;
  notices: SyncNotice[];
  dismissNotices: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * The signed-in user's on-device data and its sync (R2 T061–T063): opens the user's store, runs the
 * sync triggers, and gives screens the rows, the number of changes waiting to be sent, and notices.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [opened, setOpened] = useState<{ userId: string; store: SyncStore; engine: SyncEngine } | null>(null);
  const [version, setVersion] = useState(0);
  const [notices, setNotices] = useState<SyncNotice[]>([]);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void syncFor(userId).then((s) => {
      if (live) setOpened({ userId, ...s });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const current = opened && opened.userId === userId ? opened : null;
  const pendingCount = useCallback(async () => (current ? current.store.pendingCount() : 0), [current]);
  const triggers = useSyncTriggers(current?.engine ?? null, pendingCount);

  // After each sync run, re-read rows and notices.
  useEffect(() => {
    if (!current || triggers.syncing) return;
    let live = true;
    void current.store.notices().then((n) => {
      if (live) {
        setNotices(n);
        setVersion((v) => v + 1);
      }
    });
    return () => {
      live = false;
    };
  }, [current, triggers.syncing]);

  const value = useMemo<SyncContextValue>(
    () => ({
      ...triggers,
      ready: current !== null,
      version,
      async record(change) {
        if (!current) throw new Error("Not signed in");
        await current.engine.record(change);
        setVersion((v) => v + 1);
        triggers.changed();
      },
      rows: async (entity) => (current ? liveRows(current.store, entity) : []),
      async row(entity, id) {
        const found = current ? await current.store.getRow(entity, id) : null;
        return found && found.state !== "deleted" ? found : null;
      },
      notices,
      async dismissNotices() {
        await current?.store.clearNotices();
        setNotices([]);
      },
    }),
    [current, triggers, version, notices],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}

/** Re-reads `load` whenever local data changes. */
export function useSyncedData<T>(load: () => Promise<T>, initial: T): T {
  const { version, ready } = useSync();
  const [data, setData] = useState<T>(initial);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void load().then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on data version, not on load identity
  }, [version, ready]);
  return data;
}
