import { describe, expect, it } from "vitest";
import { Change } from "../src/sync/schemas";

/** Category, tag and payee shapes on the wire (R3 contracts/sync-protocol.md, Principle VIII). */
const ids = {
  changeId: "6f1b2c3d-4e5f-4a6b-8c7d-8e9fa0b1c2d3",
  entityId: "0a1b2c3d-4e5f-4a6b-8c7d-8e9fa0b1c2d3",
  other: "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
};
const hlc = "1793011200000.0000.webbrw01";
const change = (entity: string, kind: string, fields?: Record<string, unknown>) =>
  Change.safeParse({ changeId: ids.changeId, entity, entityId: ids.entityId, kind, fields, hlc });

const category = { name: "  Groceries ", kind: "expense", colour: "green", icon: "shopping-cart" };
const business = { name: "Fresh Mart", kind: "business" };
const person = { name: "Ravi Kumar", kind: "person", openingBalanceMinor: "1500000", openingBalanceDate: "2026-04-01" };

describe("category changes", () => {
  it("accepts a create, trims the name and fills defaults", () => {
    const r = change("category", "create", category);
    expect(r.success).toBe(true);
    expect(r.data?.fields).toEqual({ ...category, name: "Groceries", parentId: null, hidden: false });
  });

  it("checks name length, kind, colour and icon keys", () => {
    expect(change("category", "create", { ...category, name: "x".repeat(41) }).success).toBe(false);
    expect(change("category", "create", { ...category, name: "₹".repeat(40) }).success).toBe(true);
    expect(change("category", "create", { ...category, kind: "transfer" }).success).toBe(false);
    expect(change("category", "create", { ...category, colour: "magenta" }).success).toBe(false);
    expect(change("category", "create", { ...category, icon: "rocket" }).success).toBe(false);
    expect(change("category", "create", { ...category, icon: "bank" }).success).toBe(true);
  });

  it("never updates kind; moves, renames and hides by update", () => {
    expect(change("category", "update", { kind: "income" }).success).toBe(false);
    expect(change("category", "update", { parentId: ids.other }).success).toBe(true);
    expect(change("category", "update", { parentId: null }).success).toBe(true);
    expect(change("category", "update", { hidden: true }).success).toBe(true);
    expect(change("category", "update", {}).success).toBe(false);
  });

  it("allows delete and merge but not archive or restore", () => {
    expect(change("category", "delete").success).toBe(true);
    expect(change("category", "merge", { targetId: ids.other }).success).toBe(true);
    expect(change("category", "archive").success).toBe(false);
    expect(change("category", "restore").success).toBe(false);
  });
});

describe("tag changes", () => {
  it("takes a 1–30 character name only", () => {
    expect(change("tag", "create", { name: "Goa trip" }).success).toBe(true);
    expect(change("tag", "create", { name: "x".repeat(31) }).success).toBe(false);
    expect(change("tag", "update", { name: "Goa trip 2026" }).success).toBe(true);
    expect(change("tag", "update", { hidden: true }).success).toBe(false);
  });
});

describe("payee changes", () => {
  it("accepts a business with defaults and a person with an opening balance", () => {
    const b = change("payee", "create", business);
    expect(b.data?.fields).toEqual({
      ...business,
      defaultCategoryId: null,
      notes: null,
      hidden: false,
      openingBalanceMinor: "0",
      openingBalanceDate: null,
      includeInNetWorth: false,
      interestMode: "none", // R4
    });
    expect(change("payee", "create", person).success).toBe(true);
    expect(change("payee", "create", { ...person, openingBalanceMinor: "-450000" }).success).toBe(true);
  });

  it("requires a date for a person and keeps businesses at zero", () => {
    expect(change("payee", "create", { ...person, openingBalanceDate: undefined }).success).toBe(false);
    expect(change("payee", "create", { ...business, openingBalanceMinor: "100" }).success).toBe(false);
    expect(change("payee", "create", { ...business, openingBalanceDate: "2026-04-01" }).success).toBe(false);
    expect(change("payee", "create", { ...business, includeInNetWorth: true }).success).toBe(false);
  });

  it("checks name length, notes length and money as strings", () => {
    expect(change("payee", "create", { ...business, name: "x".repeat(61) }).success).toBe(false);
    expect(change("payee", "create", { ...business, notes: "n".repeat(501) }).success).toBe(false);
    expect(change("payee", "create", { ...person, openingBalanceMinor: 1500000 }).success).toBe(false);
    expect(change("payee", "create", { ...person, openingBalanceMinor: "15000.00" }).success).toBe(false);
  });

  it("rejects server-controlled fields", () => {
    for (const extra of [{ userId: "x" }, { state: "deleted" }, { mergedInto: ids.other }, { fieldVersions: {} }, { serverSeq: "1" }]) {
      expect(change("payee", "update", { name: "A", ...extra }).success).toBe(false);
      expect(change("category", "update", { name: "A", ...extra }).success).toBe(false);
    }
  });
});

describe("merge changes", () => {
  it("carry exactly a target id and are not allowed for accounts", () => {
    expect(change("tag", "merge", { targetId: ids.other }).success).toBe(true);
    expect(change("tag", "merge", {}).success).toBe(false);
    expect(change("tag", "merge", { targetId: ids.other, name: "x" }).success).toBe(false);
    expect(change("payee", "merge", { targetId: "not-a-uuid" }).success).toBe(false);
    expect(change("account", "merge", { targetId: ids.other }).success).toBe(false);
  });
});
