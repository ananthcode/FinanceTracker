/**
 * Locking a backup with a password (R10-04, clarify Q1): PBKDF2-SHA-256 (600,000 iterations, 16-byte salt)
 * derives an AES-GCM 256 key; each piece is encrypted with its own 12-byte IV. Web Crypto only; the password
 * never leaves the device. A wrong password fails AES-GCM's check: "WRONG_PASSWORD".
 */
import { BACKUP_FORMAT, BACKUP_VERSION, type LockedBackup } from "./backup";

/** The derived key (Web Crypto's CryptoKey, without depending on DOM types). */
export type LockKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.deriveKey>>;

export const LOCK_ITERATIONS = 600_000;
export const MIN_PASSWORD = 8;

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("CRYPTO_UNAVAILABLE");
  return s;
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : B64[c & 63]!;
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let n = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : -1));
    out[n++] = (v[0]! << 2) | (v[1]! >> 4);
    if (v[2]! >= 0) out[n++] = ((v[1]! & 15) << 4) | (v[2]! >> 2);
    if (v[3]! >= 0) out[n++] = ((v[2]! & 3) << 6) | v[3]!;
  }
  return out.slice(0, n);
}

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>;

export async function deriveKey(password: string, salt: Uint8Array, iterations = LOCK_ITERATIONS): Promise<LockKey> {
  const base = await subtle().importKey("raw", buf(new TextEncoder().encode(password)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buf(salt), iterations }, base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** IV (12 bytes) followed by the ciphertext. */
export async function encryptWithKey(key: LockKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, buf(bytes)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function decryptWithKey(key: LockKey, bytes: Uint8Array): Promise<Uint8Array> {
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(bytes.slice(0, 12)) }, key, buf(bytes.slice(12))));
  } catch {
    throw new Error("WRONG_PASSWORD");
  }
}

/** Locks a backup's JSON text; returns the locked file's JSON text and the key (for attachment files). */
export async function lockBackupText(text: string, password: string, iterations = LOCK_ITERATIONS): Promise<{ text: string; key: LockKey }> {
  if ([...password].length < MIN_PASSWORD) throw new Error("PASSWORD_TOO_SHORT");
  const salt = random(16);
  const key = await deriveKey(password, salt, iterations);
  const sealed = await encryptWithKey(key, new TextEncoder().encode(text));
  const locked: LockedBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    locked: { kdf: "PBKDF2-SHA-256", iterations, salt: toBase64(salt), iv: toBase64(sealed.slice(0, 12)) },
    data: toBase64(sealed.slice(12)),
  };
  return { text: JSON.stringify(locked), key };
}

/** Unlocks a locked backup; throws "WRONG_PASSWORD". Returns the plain JSON text and the key. */
export async function unlockBackup(locked: LockedBackup, password: string): Promise<{ text: string; key: LockKey }> {
  const key = await deriveKey(password, fromBase64(locked.locked.salt), locked.locked.iterations);
  const iv = fromBase64(locked.locked.iv);
  const data = fromBase64(locked.data);
  const sealed = new Uint8Array(iv.length + data.length);
  sealed.set(iv);
  sealed.set(data, iv.length);
  const plain = await decryptWithKey(key, sealed);
  return { text: new TextDecoder().decode(plain), key };
}
