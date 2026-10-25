import { describe, expect, it } from "vitest";
import { Change, PushRequest } from "../src/sync/schemas";

/** Change / push shapes (contracts/sync-protocol.md, Principle VIII). */
const base = {
  changeId: "6f1b2c3d-4e5f-4a6b-8c7d-8e9fa0b1c2d3",
  entity: "account",
  entityId: "0a1b2c3d-4e5f-4a6b-8c7d-8e9fa0b1c2d3",
  hlc: "1793011200000.0000.webbrw01",
};
const createFields = {
  name: "  Everyday Savings ",
  type: "bank",
  openingBalanceMinor: "5234050",
  openingBalanceDate: "2026-04-01",
  colour: "blue",
  icon: "bank",
  sortKey: "a0",
};

describe("Change", () => {
  it("accepts a full account create, trims the name and fills defaults", () => {
    const c = Change.parse({ ...base, kind: "create", fields: createFields, options: { onNameConflict: "reject" } });
    expect(c.fields).toEqual({
      ...createFields,
      name: "Everyday Savings",
      groupId: null,
      includeInNetWorth: true,
      notes: null,
      creditLimitMinor: null,
    });
  });

  it("rejects money as a JSON number (never floats on the wire)", () => {
    expect(Change.safeParse({ ...base, kind: "create", fields: { ...createFields, openingBalanceMinor: 5234050 } }).success).toBe(false);
    expect(Change.safeParse({ ...base, kind: "create", fields: { ...createFields, openingBalanceMinor: "52340.50" } }).success).toBe(false);
  });

  it("rejects server-controlled and unknown fields", () => {
    for (const extra of [{ userId: "x" }, { currency: "INR" }, { state: "archived" }, { serverSeq: "1" }, { colourHex: "#fff" }]) {
      expect(Change.safeParse({ ...base, kind: "update", fields: { name: "A", ...extra } }).success).toBe(false);
    }
  });

  it("enforces name length in characters and a credit limit only on credit cards", () => {
    expect(Change.safeParse({ ...base, kind: "update", fields: { name: "x".repeat(41) } }).success).toBe(false);
    expect(Change.safeParse({ ...base, kind: "update", fields: { name: "₹".repeat(40) } }).success).toBe(true);
    expect(Change.safeParse({ ...base, kind: "update", fields: { name: "   " } }).success).toBe(false);
    expect(
      Change.safeParse({ ...base, kind: "create", fields: { ...createFields, creditLimitMinor: "100000" } }).success,
    ).toBe(false);
    expect(
      Change.safeParse({ ...base, kind: "create", fields: { ...createFields, type: "credit_card", creditLimitMinor: "100000" } })
        .success,
    ).toBe(true);
    expect(Change.safeParse({ ...base, kind: "update", fields: { creditLimitMinor: "0" } }).success).toBe(false);
  });

  it("requires fields for create/update and none for lifecycle changes", () => {
    expect(Change.safeParse({ ...base, kind: "update", fields: {} }).success).toBe(false);
    expect(Change.safeParse({ ...base, kind: "archive" }).success).toBe(true);
    expect(Change.safeParse({ ...base, kind: "archive", fields: { name: "x" } }).success).toBe(false);
    expect(Change.safeParse({ ...base, kind: "update", fields: { openingBalanceDate: "2026-02-30" } }).success).toBe(false);
  });

  it("does not allow archiving groups", () => {
    expect(Change.safeParse({ ...base, entity: "account_group", kind: "archive" }).success).toBe(false);
    expect(Change.safeParse({ ...base, entity: "account_group", kind: "delete" }).success).toBe(true);
    expect(
      Change.safeParse({ ...base, entity: "account_group", kind: "create", fields: { name: "Held for family", sortKey: "a0" } })
        .success,
    ).toBe(true);
  });

  it("rejects a malformed HLC", () => {
    expect(Change.safeParse({ ...base, kind: "archive", hlc: "123.0.abc" }).success).toBe(false);
  });
});

describe("PushRequest", () => {
  it("takes 1–100 changes", () => {
    const change = { ...base, kind: "archive" };
    expect(PushRequest.safeParse({ device: "web", changes: [] }).success).toBe(false);
    expect(PushRequest.safeParse({ device: "web", changes: Array(100).fill(change) }).success).toBe(true);
    expect(PushRequest.safeParse({ device: "web", changes: Array(101).fill(change) }).success).toBe(false);
    expect(PushRequest.safeParse({ device: "ios", changes: [change] }).success).toBe(false);
  });
});
