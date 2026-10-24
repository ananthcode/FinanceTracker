import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Web E2E for user stories (quickstart.md). Runs against the local Supabase stack
 * (`pnpm db:start`) and `next dev`. Emails are read from the local Mailpit inbox.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // stories share one local database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.WEB_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev --port 3000",
    url: "http://localhost:3000/config-error",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
