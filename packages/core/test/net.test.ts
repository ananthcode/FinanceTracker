import { describe, expect, it } from "vitest";
import { isSecureOrLocalUrl } from "../src/net";

describe("isSecureOrLocalUrl (FR-036a)", () => {
  it("accepts https anywhere", () => {
    expect(isSecureOrLocalUrl("https://demo.example.com")).toBe(true);
  });

  it("accepts plain http only for local development hosts", () => {
    expect(isSecureOrLocalUrl("http://localhost:3000")).toBe(true);
    expect(isSecureOrLocalUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isSecureOrLocalUrl("http://10.0.2.2:3000")).toBe(true);
    expect(isSecureOrLocalUrl("http://demo.example.com")).toBe(false);
  });

  it("rejects other schemes and garbage", () => {
    expect(isSecureOrLocalUrl("ftp://example.com")).toBe(false);
    expect(isSecureOrLocalUrl("not a url")).toBe(false);
    expect(isSecureOrLocalUrl("")).toBe(false);
  });
});
