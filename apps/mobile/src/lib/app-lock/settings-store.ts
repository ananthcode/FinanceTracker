/** App-lock settings kept on this phone (R1 T107; spec "Device Settings"). */
import * as SecureStore from "expo-secure-store";

const SETTINGS_KEY = "ft.appLock.settings";

/** Lock after this many seconds in the background: immediately, 1, 5 or 15 minutes (FR-026). */
export const LOCK_TIMEOUTS = [0, 60, 300, 900] as const;
export type LockTimeout = (typeof LOCK_TIMEOUTS)[number];

export const MAX_PIN_ATTEMPTS = 5;

export interface AppLockSettings {
  enabled: boolean;
  timeoutSec: LockTimeout;
  biometrics: boolean;
  /** Set when the phone's enrolled fingerprints changed: PIN required, then re-confirm (FR-026b). */
  biometricsSuspended: boolean;
  failedAttempts: number;
}

export const DEFAULT_SETTINGS: AppLockSettings = {
  enabled: false,
  timeoutSec: 60,
  biometrics: false,
  biometricsSuspended: false,
  failedAttempts: 0,
};

export async function loadSettings(): Promise<AppLockSettings> {
  const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppLockSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppLockSettings): Promise<void> {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
}

export async function clearSettings(): Promise<void> {
  await SecureStore.deleteItemAsync(SETTINGS_KEY);
}
