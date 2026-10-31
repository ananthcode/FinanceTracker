import { AppLockController, type AppLockDeps } from "@/lib/app-lock/controller";
import { hashPin, isValidPin, setPin, verifyPin } from "@/lib/app-lock/pin";
import { DEFAULT_SETTINGS, LOCK_TIMEOUTS, type AppLockSettings } from "@/lib/app-lock/settings-store";

/** R1 T105 — app lock (FR-026 – FR-029; quickstart S6-a … S6-c). */
function setup(initial: Partial<AppLockSettings> = {}, correctPin = "4826") {
  let settings: AppLockSettings = { ...DEFAULT_SETTINGS, enabled: true, ...initial };
  let clock = 1_000_000;
  const calls: string[] = [];
  const deps: AppLockDeps = {
    load: async () => settings,
    save: async (s) => void (settings = s),
    verifyPin: async (pin) => pin === correctPin,
    clearPin: async () => void calls.push("clearPin"),
    signOutKeepingPending: async () => void calls.push("signOutKeepingPending"),
    signOut: async () => void calls.push("signOut"),
    now: () => clock,
  };
  return {
    controller: new AppLockController(deps),
    settings: () => settings,
    calls,
    advance: (ms: number) => void (clock += ms),
  };
}

describe("PIN", () => {
  it("accepts 4–6 digits only", () => {
    for (const ok of ["1234", "12345", "123456"]) expect(isValidPin(ok)).toBe(true);
    for (const bad of ["123", "1234567", "12a4", " 1234", ""]) expect(isValidPin(bad)).toBe(false);
  });

  it("stores only a salted hash and verifies against it", async () => {
    await setPin("4826");
    expect(await verifyPin("4826")).toBe(true);
    expect(await verifyPin("4827")).toBe(false);
    const SecureStore = jest.requireMock("expo-secure-store") as { getItemAsync: (k: string) => Promise<string | null> };
    const stored = (await SecureStore.getItemAsync("ft.appLock.pin"))!;
    expect(stored).not.toContain("4826");
    const { salt, hash } = JSON.parse(stored) as { salt: string; hash: string };
    expect(hash).toBe(hashPin("4826", salt));
    expect(hashPin("4826", "00".repeat(16))).not.toBe(hash); // a different salt gives a different hash
  });
});

describe("AppLockController", () => {
  it("opens locked when the lock is on, and unlocked when off", async () => {
    expect(await setup().controller.lockedOnStart()).toBe(true);
    expect(await setup({ enabled: false }).controller.lockedOnStart()).toBe(false);
  });

  it.each(LOCK_TIMEOUTS)("locks after %i s in the background, not before", async (timeoutSec) => {
    const t = setup({ timeoutSec });
    t.controller.onBackground();
    if (timeoutSec > 0) {
      t.advance(timeoutSec * 1000 - 1);
      expect(await t.controller.onForeground()).toBe(false);
      t.controller.onBackground();
      t.advance(timeoutSec * 1000);
    }
    expect(await t.controller.onForeground()).toBe(true);
  });

  it("unlocks with the right PIN and resets the count", async () => {
    const t = setup({ failedAttempts: 2 });
    expect(await t.controller.submitPin("4826")).toEqual({ ok: true });
    expect(t.settings().failedAttempts).toBe(0);
  });

  it("signs out after 5 wrong PINs, keeping only unsent changes (FR-028)", async () => {
    const t = setup();
    for (let i = 1; i <= 4; i++) expect(await t.controller.submitPin("0000")).toEqual({ ok: false, remaining: 5 - i });
    expect(await t.controller.submitPin("0000")).toEqual({ ok: false, signedOut: true });
    expect(t.calls).toEqual(["clearPin", "signOutKeepingPending"]);
    expect(t.settings()).toMatchObject({ enabled: false, failedAttempts: 0 });
  });

  it("Forgot PIN signs out and clears the old PIN and the lock (FR-029)", async () => {
    const t = setup({ biometrics: true });
    await t.controller.forgotPin();
    expect(t.calls).toEqual(["clearPin", "signOut"]);
    expect(t.settings()).toMatchObject({ enabled: false, biometrics: false });
  });

  it("suspends fingerprint when enrolment changed until the PIN is used (FR-026b)", async () => {
    const t = setup({ biometrics: true });
    await t.controller.suspendBiometrics();
    expect(t.settings().biometricsSuspended).toBe(true);
    await t.controller.submitPin("4826");
    // The PIN lifts the suspension; fingerprint stays off until the user turns it on again.
    expect(t.settings()).toMatchObject({ biometricsSuspended: false, biometrics: false });
  });
});
