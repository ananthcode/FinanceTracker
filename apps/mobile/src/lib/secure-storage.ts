import * as SecureStore from "expo-secure-store";

/**
 * Supabase session storage backed by the Android Keystore via expo-secure-store (FR-012).
 * SecureStore values are limited in size, so long values are split into chunks.
 */
const CHUNK_SIZE = 1800;

const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function removeChunks(key: string): Promise<void> {
  const count = Number((await SecureStore.getItemAsync(countKey(key))) ?? "0");
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  await SecureStore.deleteItemAsync(countKey(key));
}

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number((await SecureStore.getItemAsync(countKey(key))) ?? "0");
    if (count === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // partially written — treat as absent
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(countKey(key), String(count));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
  },
};
