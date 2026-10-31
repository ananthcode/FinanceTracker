/**
 * App-lock rules (R1 T109; FR-026 – FR-029). Pure logic with its effects passed in, so it is
 * tested without a phone:
 * - locked on a cold start, and on return after at least the timeout in the background;
 * - a wrong PIN counts; the 5th consecutive one signs the user out and removes everything except
 *   unsent changes, which stay sealed for the same user (FR-028);
 * - "Forgot PIN" signs the user out; after the full sign-in the old PIN is cleared (FR-029).
 */
import { MAX_PIN_ATTEMPTS, type AppLockSettings } from "./settings-store";

export interface AppLockDeps {
  load(): Promise<AppLockSettings>;
  save(settings: AppLockSettings): Promise<void>;
  verifyPin(pin: string): Promise<boolean>;
  clearPin(): Promise<void>;
  /** Sign out on this phone and keep only unsent changes, sealed (5 wrong PINs). */
  signOutKeepingPending(): Promise<void>;
  /** Sign out on this phone (Forgot PIN); nothing else is removed. */
  signOut(): Promise<void>;
  now(): number;
}

export type PinOutcome = { ok: true } | { ok: false; remaining: number } | { ok: false; signedOut: true };

export class AppLockController {
  private backgroundedAt: number | null = null;

  constructor(private readonly deps: AppLockDeps) {}

  /** Should the app open locked (cold start)? */
  async lockedOnStart(): Promise<boolean> {
    return (await this.deps.load()).enabled;
  }

  onBackground(): void {
    this.backgroundedAt = this.deps.now();
  }

  /** On return to the foreground: lock if the time away reached the timeout (0 = always). */
  async onForeground(): Promise<boolean> {
    const settings = await this.deps.load();
    const since = this.backgroundedAt;
    this.backgroundedAt = null;
    if (!settings.enabled || since === null) return false;
    return this.deps.now() - since >= settings.timeoutSec * 1000;
  }

  async submitPin(pin: string): Promise<PinOutcome> {
    const settings = await this.deps.load();
    if (await this.deps.verifyPin(pin)) {
      // The PIN also lifts a suspension caused by changed fingerprints (FR-026b); the user re-confirms
      // fingerprint in settings.
      await this.deps.save({ ...settings, failedAttempts: 0, biometrics: settings.biometricsSuspended ? false : settings.biometrics, biometricsSuspended: false });
      return { ok: true };
    }
    const failedAttempts = settings.failedAttempts + 1;
    if (failedAttempts >= MAX_PIN_ATTEMPTS) {
      await this.deps.save({ ...settings, enabled: false, biometrics: false, biometricsSuspended: false, failedAttempts: 0 });
      await this.deps.clearPin();
      await this.deps.signOutKeepingPending();
      return { ok: false, signedOut: true };
    }
    await this.deps.save({ ...settings, failedAttempts });
    return { ok: false, remaining: MAX_PIN_ATTEMPTS - failedAttempts };
  }

  /** Fingerprints changed since enabling: suspend fingerprint until the PIN is used. */
  async suspendBiometrics(): Promise<void> {
    const settings = await this.deps.load();
    await this.deps.save({ ...settings, biometricsSuspended: true });
  }

  /** "Forgot PIN": a full sign-in is required; the lock and the old PIN are cleared (FR-029). */
  async forgotPin(): Promise<void> {
    const settings = await this.deps.load();
    await this.deps.save({ ...settings, enabled: false, biometrics: false, biometricsSuspended: false, failedAttempts: 0 });
    await this.deps.clearPin();
    await this.deps.signOut();
  }
}
