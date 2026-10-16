/**
 * Device-local data contract (T042). R1 stores no offline records, so this is a no-op
 * implementation; R2's offline sync engine implements it for real.
 *
 * Rules every implementation MUST follow (constitution IV, FR-028):
 * - Never discard a user's unsent changes without an explicit confirmation or the FR-028 rule.
 * - After 5 wrong PINs: remove everything except unsent changes, which stay sealed, tagged with
 *   the user id, hidden from the UI and sent only after the same user signs in again.
 */
export interface LocalDataStore {
  /** Unsent changes for this user (shown in the sign-out warning). */
  pendingCount(userId: string): Promise<number>;
  /** Remove all of this user's local data, including unsent changes (erasure, explicit discard). */
  wipeAll(userId: string): Promise<void>;
  /** Remove cached data but keep unsent changes sealed for this user (FR-028). */
  wipeExceptPending(userId: string): Promise<void>;
}

export const localData: LocalDataStore = {
  async pendingCount() {
    return 0;
  },
  async wipeAll() {
    // nothing stored locally in R1 besides session/preferences caches handled elsewhere
  },
  async wipeExceptPending() {
    // nothing stored locally in R1
  },
};
