import * as Crypto from "expo-crypto";

/**
 * A new random (v4) UUID for client-generated ids (R2 sync protocol). React Native has no
 * `globalThis.crypto`, so this uses expo-crypto, which reads the platform's secure random source.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
