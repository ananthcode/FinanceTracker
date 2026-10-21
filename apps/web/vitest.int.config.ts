import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Integration tests talk to the local Supabase stack (`pnpm db:start`). Locally they read
// apps/web/.env.local; in CI the workflow exports the same variables.
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);

export default defineConfig({
  test: {
    include: ["**/*.int.test.ts"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    environment: "node",
    testTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${root}$1` },
      { find: "server-only", replacement: `${root}test/server-only-stub.ts` },
    ],
  },
});
