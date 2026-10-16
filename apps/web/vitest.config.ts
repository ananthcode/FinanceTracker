import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    environment: "node",
    // First import of the Supabase libraries is slow on a cold transform.
    testTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${root}$1` },
      // `server-only` throws outside the React server build; it is a no-op under tests.
      { find: "server-only", replacement: `${root}test/server-only-stub.ts` },
    ],
  },
});
