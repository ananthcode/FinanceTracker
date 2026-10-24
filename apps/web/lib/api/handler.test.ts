import { beforeAll, describe, expect, it } from "vitest";

const SECRET_EMAIL = "asha.test@example.com";
const SECRET_TOKEN = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9f";
const SECRET_PASSWORD = "violet-kettle-orbit-27";

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

describe("checkOrigin (FR-036b)", () => {
  it("accepts same-origin browser mutations and rejects cross-site ones", async () => {
    const { checkOrigin } = await import("./handler");
    const base = "http://localhost:3000";
    const same = new Request(`${base}/api/x`, { method: "POST", headers: { origin: base } });
    const cross = new Request(`${base}/api/x`, { method: "POST", headers: { origin: "https://evil.example" } });
    expect(checkOrigin(same, base)).toBe(true);
    expect(checkOrigin(cross, base)).toBe(false);
  });

  it("requires the Android client header when there is no Origin", async () => {
    const { checkOrigin } = await import("./handler");
    const base = "http://localhost:3000";
    const bare = new Request(`${base}/api/x`, { method: "POST" });
    const android = new Request(`${base}/api/x`, { method: "POST", headers: { "x-ft-client": "android" } });
    expect(checkOrigin(bare, base)).toBe(false);
    expect(checkOrigin(android, base)).toBe(true);
  });

  it("does not restrict safe methods", async () => {
    const { checkOrigin } = await import("./handler");
    expect(checkOrigin(new Request("http://localhost:3000/api/x"), "http://localhost:3000")).toBe(true);
  });
});

describe("route wrapper error handling and logging (FR-036d)", () => {
  it("returns an errorId and never logs emails, tokens or passwords", async () => {
    const { route } = await import("./handler");
    const { setLogSink } = await import("./log");
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));

    const handler = route({ auth: "none", name: "/api/test" }, async () => {
      throw new Error(`boom for ${SECRET_EMAIL} with ${SECRET_TOKEN} and ${SECRET_PASSWORD}`);
    });
    const res = await handler(
      new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000" } }),
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; errorId: string } };
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.errorId).toMatch(/^[0-9a-f-]{36}$/);

    expect(lines).toHaveLength(1);
    const logged = lines.join("\n");
    expect(logged).toContain(body.error.errorId);
    expect(logged).not.toContain(SECRET_EMAIL);
    expect(logged).not.toContain(SECRET_TOKEN);
    expect(logged).not.toContain(SECRET_PASSWORD);
  });

  it("rejects cross-site mutations with FORBIDDEN before running the handler", async () => {
    const { route } = await import("./handler");
    let ran = false;
    const handler = route({ auth: "none", name: "/api/test" }, async () => {
      ran = true;
      return new Response(null, { status: 204 });
    });
    const res = await handler(
      new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "https://evil.example" } }),
    );
    expect(res.status).toBe(403);
    expect(ran).toBe(false);
  });
});

describe("scrub", () => {
  it("removes emails and long tokens from free text", async () => {
    const { scrub } = await import("./log");
    expect(scrub(`x ${SECRET_EMAIL} y ${SECRET_TOKEN}`)).toBe("x [email] y [token]");
  });
});
