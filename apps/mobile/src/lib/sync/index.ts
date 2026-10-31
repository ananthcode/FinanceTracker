/**
 * The signed-in user's sync engine on this phone (R2 T061). One engine per user, created on first
 * use; screens record changes through it and read rows from its store.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { DEVICE_ID_PATTERN } from "@ft/core";
import { SyncEngine } from "./engine";
import { SqliteSyncStore } from "./store";
import { apiTransport } from "./transport";
import type { SyncStore } from "./types";

export { SyncEngine, applyLocally, liveRows } from "./engine";
export type { SyncNotice, SyncRow, SyncStore } from "./types";

const DEVICE_KEY = "ft.deviceId";

/** A random id for this installation, created once and kept in SecureStore (sync-protocol §HLC). */
export async function deviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_KEY);
  if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
  const created = `and${Array.from(Crypto.getRandomBytes(12), (b) => (b % 36).toString(36)).join("")}`;
  await SecureStore.setItemAsync(DEVICE_KEY, created);
  return created;
}

let current: { userId: string; store: SyncStore; engine: SyncEngine } | null = null;

/** The engine for this user; opening another user's closes nothing but never shares data. */
export async function syncFor(userId: string): Promise<{ store: SyncStore; engine: SyncEngine }> {
  if (current?.userId !== userId) {
    const store = await SqliteSyncStore.open(userId);
    current = { userId, store, engine: new SyncEngine(store, apiTransport, await deviceId()) };
  }
  return current;
}

/** The store if this user's engine is already open (sign-out checks), without creating one. */
export async function storeFor(userId: string): Promise<SyncStore> {
  return (await syncFor(userId)).store;
}
