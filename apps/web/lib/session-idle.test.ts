import { describe, expect, it } from "vitest";
import { applySessionCookiePolicy, isIdleExpired } from "./session-cookies";

const MIN = 60_000;

describe("isIdleExpired (FR-010: 30-minute idle rule when not kept signed in)", () => {
  const now = Date.UTC(2026, 9, 21, 12, 0, 0);

  it("is not expired before 30 minutes", () => {
    expect(isIdleExpired(now - 29 * MIN, now, 30)).toBe(false);
    expect(isIdleExpired(now - 30 * MIN, now, 30)).toBe(false);
  });

  it("expires after 30 minutes of inactivity", () => {
    expect(isIdleExpired(now - 30 * MIN - 1, now, 30)).toBe(true);
  });

  it("does not expire when there is no activity record yet", () => {
    expect(isIdleExpired(undefined, now, 30)).toBe(false);
    expect(isIdleExpired(Number.NaN, now, 30)).toBe(false);
  });

  it("supports a shorter test window (IDLE_MINUTES)", () => {
    expect(isIdleExpired(now - 2 * MIN, now, 1)).toBe(true);
  });
});

describe("applySessionCookiePolicy (FR-010, FR-036b)", () => {
  it("drops expiry when not kept signed in, so the cookie ends with the browser", () => {
    const opts = applySessionCookiePolicy({ maxAge: 3600, expires: new Date() }, false);
    expect(opts.maxAge).toBeUndefined();
    expect(opts.expires).toBeUndefined();
  });

  it("keeps expiry when kept signed in", () => {
    expect(applySessionCookiePolicy({ maxAge: 3600 }, true).maxAge).toBe(3600);
  });

  it("always hardens cookies", () => {
    const opts = applySessionCookiePolicy({ httpOnly: false, sameSite: "none" }, true);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
  });
});
