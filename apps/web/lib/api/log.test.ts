import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { logError, setLogSink } from "./log";

/**
 * T012 — operational logs never carry financial details (FR-028, constitution "Observability"):
 * no account names, notes, amounts or change payloads, even when an error message contains them.
 */
const ACCOUNT_NAME = "Everyday Savings";
const NOTES = "closed in 2026";
const AMOUNT = "5234050";

beforeAll(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_APP_ENV: "demo",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    WEB_BASE_URL: "http://localhost:3000",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "54325",
    SMTP_FROM: "Finance Tracker <no-reply@example.com>",
    ANDROID_APP_ID: "com.example.financetracker.demo",
    ANDROID_CERT_SHA256: "00:00",
  });
});

afterEach(() => setLogSink((line) => console.error(line)));

describe("logError", () => {
  it("writes only the error reference, route, error class and status", () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    logError({ errorId: "e1", route: "/api/sync/push", errorClass: "Error", status: 500 });
    expect(Object.keys(JSON.parse(lines[0]!))).toEqual(["level", "errorId", "route", "errorClass", "status"]);
  });
});

describe("route() error logging", () => {
  it("does not log the request body or an error message containing account data", async () => {
    const { route } = await import("./handler");
    const { z } = await import("zod");
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    const handler = route({ auth: "none", name: "/api/test", body: z.object({}).loose() }, async () => {
      throw new Error(`duplicate key (name)=(${ACCOUNT_NAME}) notes=${NOTES} opening=${AMOUNT}`);
    });
    const res = await handler(
      new Request("http://localhost:3000/api/test", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ changes: [{ fields: { name: ACCOUNT_NAME, notes: NOTES, openingBalanceMinor: AMOUNT } }] }),
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(lines).toHaveLength(1);
    for (const secret of [ACCOUNT_NAME, NOTES, AMOUNT]) {
      expect(lines[0]).not.toContain(secret);
      expect(body).not.toContain(secret);
    }
  });
});
