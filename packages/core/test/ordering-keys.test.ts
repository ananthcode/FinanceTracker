import { describe, expect, it } from "vitest";
import { keyBetween, keysBetween, planMove } from "../src/ordering/keys";

/** T005 — fractional index keys: a move changes one key (FR-010, R2-06). */
describe("keyBetween", () => {
  it("creates a first key and keys at the ends", () => {
    const first = keyBetween(null, null);
    expect(first).toBe("a0");
    const after = keyBetween(first, null);
    const before = keyBetween(null, first);
    expect(before < first && first < after).toBe(true);
  });

  it("creates a key strictly between two keys", () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);
    expect(a < b && b < c).toBe(true);
  });

  it("keeps order and stays short under 1,000 inserts into the same gap", () => {
    let lo = keyBetween(null, null);
    const hi = keyBetween(lo, null);
    for (let i = 0; i < 1000; i++) {
      const mid = keyBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      lo = mid;
    }
    // About 6 bits per base-62 character: ~170 characters after 1,000 halvings, well under the
    // 1,000-character limit of the OrderKey schema and the database check.
    expect(lo.length).toBeLessThan(250);
  });

  it("keeps order when appending many keys", () => {
    const keys = [keyBetween(null, null)];
    for (let i = 0; i < 500; i++) keys.push(keyBetween(keys[keys.length - 1]!, null));
    const sorted = [...keys].sort();
    expect(sorted).toEqual(keys);
    expect(keys.every((k) => k.length <= 4)).toBe(true);
  });

  it("orders like a byte-wise (C collation) comparison", () => {
    const keys = keysBetween(null, null, 50);
    const byteSorted = [...keys].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)));
    expect(byteSorted).toEqual(keys);
  });

  it("refuses a >= b and invalid keys", () => {
    const a = keyBetween(null, null);
    expect(() => keyBetween(a, a)).toThrow();
    expect(() => keyBetween("zz!", null)).toThrow();
    expect(() => keyBetween("a00", null)).toThrow(); // trailing zero is not canonical
  });
});

describe("planMove (FR-010)", () => {
  const apply = (list: { id: string; sortKey: string }[], changes: { id: string; sortKey: string }[]) =>
    list
      .map((i) => changes.find((c) => c.id === i.id) ?? i)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1))
      .map((i) => i.id);
  const list = [
    { id: "a", sortKey: "a0" },
    { id: "b", sortKey: "a1" },
    { id: "c", sortKey: "a2" },
  ];

  it("moves an item with a single key change", () => {
    const up = planMove(list, 2, 1);
    expect(up).toHaveLength(1);
    expect(apply(list, up)).toEqual(["a", "c", "b"]);
    expect(apply(list, planMove(list, 0, 2))).toEqual(["b", "c", "a"]);
    expect(apply(list, planMove(list, 2, 0))).toEqual(["c", "a", "b"]);
  });

  it("does nothing for a move to the same place or out of range", () => {
    expect(planMove(list, 1, 1)).toEqual([]);
    expect(planMove(list, 0, 5)).toEqual([]);
  });

  it("repairs equal keys left by two offline devices", () => {
    const tied = [
      { id: "a", sortKey: "a0" },
      { id: "b", sortKey: "a1" },
      { id: "c", sortKey: "a1" },
      { id: "d", sortKey: "a2" },
    ];
    // Move d between b and c, whose keys are equal.
    const changes = planMove(tied, 3, 2);
    expect(apply(tied, changes)).toEqual(["a", "b", "d", "c"]);
  });
});
