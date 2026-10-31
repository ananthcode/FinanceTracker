/**
 * Device-local data contract (R1 T042), backed since R2 by the user's sync store (T063).
 *
 * Rules every implementation MUST follow (constitution IV, FR-028):
 * - Never discard a user's unsent changes without an explicit confirmation or the FR-028 rule.
 * - After 5 wrong PINs: remove everything except unsent changes, which stay sealed in that user's
 *   own database (tagged with the user id by its file name), hidden from the UI and sent only after
 *   the same user signs in again.
 */
import { storeFor, syncFor } from "./sync";

export interface LocalDataStore {
  /** Unsent changes for this user (shown in the sign-out warning). */
  pendingCount(userId: string): Promise<number>;
  /** Tries to send unsent changes now; resolves to how many are still waiting. */
  flush(userId: string): Promise<number>;
  /** Remove all of this user's local data, including unsent changes (erasure, explicit discard). */
  wipeAll(userId: string): Promise<void>;
  /** Remove cached data but keep unsent changes sealed for this user (FR-028). */
  wipeExceptPending(userId: string): Promise<void>;
}

export const localData: LocalDataStore = {
  async pendingCount(userId) {
    return (await storeFor(userId)).pendingCount();
  },
  async flush(userId) {
    const { store, engine } = await syncFor(userId);
    await engine.sync();
    return store.pendingCount();
  },
  async wipeAll(userId) {
    await (await storeFor(userId)).wipeAll();
  },
  async wipeExceptPending(userId) {
    await (await storeFor(userId)).wipeExceptPending();
  },
};
