/**
 * The app-lock PIN (R1 T106, FR-026, research R-09). The PIN itself is never stored: only an
 * scrypt hash with a random per-device salt, in SecureStore (Android Keystore).
 */
import { scrypt } from "@noble/hashes/scrypt";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const PIN_KEY = "ft.appLock.pin";

/** scrypt cost: interactive-login parameters, about 0.1–0.3 s on a mid-range phone. */
const PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 } as const;

export const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function hashPin(pin: string, saltHex: string): string {
  return bytesToHex(scrypt(utf8ToBytes(pin), hexToBytes(saltHex), PARAMS));
}

/** Constant-time comparison of two hex strings of equal length. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("PIN must be 4–6 digits");
  const salt = bytesToHex(Crypto.getRandomBytes(16));
  await SecureStore.setItemAsync(PIN_KEY, JSON.stringify({ salt, hash: hashPin(pin, salt) }));
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) !== null;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored || !isValidPin(pin)) return false;
  const { salt, hash } = JSON.parse(stored) as { salt: string; hash: string };
  return sameHex(hashPin(pin, salt), hash);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}
