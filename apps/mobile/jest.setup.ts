/// <reference types="jest" />
// Shared mocks for native modules that have no implementation under Jest.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
    __reset: () => store.clear(),
  };
});

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo-crypto's test stand-in returns a fixed id; client ids must be unique (R2 sync protocol).
jest.mock("expo-crypto", () => ({ ...jest.requireActual("expo-crypto"), randomUUID: () => require("node:crypto").randomUUID() }));
