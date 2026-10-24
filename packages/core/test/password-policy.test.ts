import { describe, expect, it } from "vitest";
import { checkPassword, isCommonPassword } from "../src/auth/password-policy";

describe("isCommonPassword", () => {
  it("finds list entries case-insensitively", () => {
    expect(isCommonPassword("password")).toBe(true);
    expect(isCommonPassword("PassWord")).toBe(true);
    expect(isCommonPassword("qwerty")).toBe(true);
  });

  it("does not flag an uncommon password", () => {
    expect(isCommonPassword("violet-kettle-orbit-27")).toBe(false);
  });
});

describe("checkPassword (FR-007)", () => {
  const email = "asha.test@example.com";

  it("accepts a long uncommon password", () => {
    expect(checkPassword("violet-kettle-orbit-27", email)).toEqual({ ok: true });
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(checkPassword("abc12!", email)).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects common passwords even if long enough", () => {
    expect(checkPassword("12345678", email)).toEqual({ ok: false, reason: "common" });
    expect(checkPassword("Password1", email).ok).toBe(isCommonPassword("password1") ? false : true);
  });

  it("rejects the email local part, case-insensitively", () => {
    expect(checkPassword("Asha.Test", email)).toEqual({ ok: false, reason: "matches_email" });
  });

  it("rejects passwords over 128 characters", () => {
    expect(checkPassword("x".repeat(129), email)).toEqual({ ok: false, reason: "too_long" });
  });
});
