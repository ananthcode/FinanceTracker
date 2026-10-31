/**
 * Fingerprint unlock (R1 T108; FR-026, FR-026b, research R-09). Strong biometrics only. Unlocking
 * reads a SecureStore key created with `requireAuthentication`: Android invalidates that key when
 * the enrolled fingerprints change, so a failed read means "enrolment changed" — fingerprint unlock
 * is then suspended until the PIN is entered and the user turns fingerprint on again.
 */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIO_KEY = "ft.appLock.bio";
const BIO_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: "Unlock Finance Tracker",
};

/** Whether this phone has strong biometrics enrolled. */
export async function biometricsAvailable(): Promise<boolean> {
  const [hardware, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return hardware && enrolled && level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
}

/** Turns fingerprint unlock on: binds a key to the current enrolment (prompts once). */
export async function enableBiometrics(): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(BIO_KEY, "1", BIO_OPTIONS);
    return true;
  } catch {
    return false;
  }
}

export async function disableBiometrics(): Promise<void> {
  await SecureStore.deleteItemAsync(BIO_KEY).catch(() => undefined);
}

export type BiometricResult = "unlocked" | "cancelled" | "enrolment-changed";

/** Prompts for a fingerprint by reading the bound key. */
export async function unlockWithBiometrics(): Promise<BiometricResult> {
  try {
    const value = await SecureStore.getItemAsync(BIO_KEY, BIO_OPTIONS);
    // A missing key after enabling also means the key was invalidated.
    return value === "1" ? "unlocked" : "enrolment-changed";
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("cancel") || message.includes("user")) return "cancelled";
    return "enrolment-changed";
  }
}
