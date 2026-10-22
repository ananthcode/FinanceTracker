import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { KEEP_SIGNED_IN_COOKIE } from "@/lib/session-cookies";
import { proxy } from "./proxy";

/**
 * T104: when the backend cannot be reached (paused or down), signed-in pages show "service
 * temporarily unavailable" — the user is not treated as signed out or inactive.
 */
beforeAll(() => {
  // Nothing listens on port 9 (discard); every call to the backend fails at the network level.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

function sessionCookie(): string {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "header.payload.signature",
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated" },
  };
  return `sb-127-auth-token=${encodeURIComponent(JSON.stringify(session))}; ${KEEP_SIGNED_IN_COOKIE}=1`;
}

function request(path: string, withSession: boolean): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: withSession ? { cookie: sessionCookie() } : {},
  });
}

describe("proxy when the backend is unreachable (T104)", () => {
  it("sends a signed-in page to /unavailable rather than signing the user out", async () => {
    const res = await proxy(request("/settings", true));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/unavailable");
  });

  it("leaves public pages alone", async () => {
    const res = await proxy(request("/unavailable", true));
    expect(res.headers.get("location")).toBeNull();
  });

  it("without a session still goes to sign-in (no backend call is needed to know that)", async () => {
    const res = await proxy(request("/settings", false));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/sign-in");
  });
});
