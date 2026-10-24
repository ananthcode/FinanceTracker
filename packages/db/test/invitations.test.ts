import { describe, expect, it } from "vitest";
import {
  hashInvitationToken,
  invitationLink,
  maskEmail,
  newInvitationToken,
  toByteaHex,
} from "../src/server/invitations";

describe("invitation tokens (FR-003a)", () => {
  it("are 43-char base64url strings with a 32-byte SHA-256 hash", () => {
    const { token, tokenHash } = newInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toHaveLength(32);
    expect(hashInvitationToken(token).equals(tokenHash)).toBe(true);
  });

  it("are unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newInvitationToken().token));
    expect(tokens.size).toBe(200);
  });

  it("hex-encode for bytea", () => {
    expect(toByteaHex(Buffer.from([0, 255]))).toBe("\\x00ff");
  });
});

describe("links and masking", () => {
  it("builds links from the web origin only", () => {
    expect(invitationLink("https://demo.example.com/some/path", "abc")).toBe("https://demo.example.com/invite/abc");
  });

  it("masks emails", () => {
    expect(maskEmail("asha.test@example.com")).toBe("a***@example.com");
  });
});
