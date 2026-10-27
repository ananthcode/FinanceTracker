import { describe, expect, it } from "vitest";
import { CLOCK_SKEW_LIMIT_MS, clampHlc, compareHlc, formatHlc, nextHlc, observeHlc, parseHlc } from "../src/sync/hlc";

/** T006 — hybrid logical clock (contracts/sync-protocol.md §HLC, R2-02). */
const DEV = "dev0000a";

describe("HLC format", () => {
  it("formats fixed-width so text order equals time order", () => {
    expect(formatHlc({ wall: 1793011200000, counter: 3, device: DEV })).toBe("1793011200000.0003.dev0000a");
    expect(parseHlc("1793011200000.0003.dev0000a")).toEqual({ wall: 1793011200000, counter: 3, device: DEV });
    expect(() => parseHlc("17930.0003.dev0000a")).toThrow();
    expect(() => parseHlc("1793011200000.3.dev0000a")).toThrow();
    expect(() => parseHlc("1793011200000.0003.BAD!")).toThrow();
  });
});

describe("nextHlc", () => {
  it("uses the wall clock when it moves forward", () => {
    const a = nextHlc(null, 1000, DEV);
    expect(a).toEqual({ wall: 1000, counter: 0, device: DEV });
    expect(nextHlc(a, 2000, DEV)).toEqual({ wall: 2000, counter: 0, device: DEV });
  });

  it("stays monotonic with a frozen or backwards clock", () => {
    let h = nextHlc(null, 5000, DEV);
    const seen = [formatHlc(h)];
    for (const now of [5000, 5000, 4000, 3000, 5000]) {
      h = nextHlc(h, now, DEV);
      seen.push(formatHlc(h));
    }
    for (let i = 1; i < seen.length; i++) expect(compareHlc(seen[i - 1]!, seen[i]!)).toBe(-1);
    expect(h).toEqual({ wall: 5000, counter: 5, device: DEV });
  });

  it("moves to the next millisecond when the counter is exhausted", () => {
    const h = nextHlc({ wall: 7000, counter: 9999, device: DEV }, 7000, DEV);
    expect(h).toEqual({ wall: 7001, counter: 0, device: DEV });
  });
});

describe("observeHlc", () => {
  it("advances past a pulled HLC so the next local edit orders after it", () => {
    const local = nextHlc(null, 1000, DEV);
    const remote = parseHlc("0000000009000.0007.otherdev");
    const observed = observeHlc(local, remote);
    const next = nextHlc(observed, 1000, DEV);
    expect(compareHlc(formatHlc(next), formatHlc(remote))).toBe(1);
  });
});

describe("compareHlc", () => {
  it("orders by wall time, then counter, then device id", () => {
    expect(compareHlc("1000000000000.0000.aaaaaaaa", "1000000000001.0000.aaaaaaaa")).toBe(-1);
    expect(compareHlc("1000000000000.0002.aaaaaaaa", "1000000000000.0001.zzzzzzzz")).toBe(1);
    expect(compareHlc("1000000000000.0001.bbbbbbbb", "1000000000000.0001.aaaaaaaa")).toBe(1);
    expect(compareHlc("1000000000000.0001.aaaaaaaa", "1000000000000.0001.aaaaaaaa")).toBe(0);
  });
});

describe("clampHlc", () => {
  it("caps wall time at receivedAt + 5 minutes and reports it", () => {
    const receivedAt = 1_800_000_000_000;
    expect(CLOCK_SKEW_LIMIT_MS).toBe(300_000);
    const fine = formatHlc({ wall: receivedAt + 299_999, counter: 1, device: DEV });
    expect(clampHlc(fine, receivedAt)).toEqual({ hlc: fine, clamped: false });
    const future = formatHlc({ wall: receivedAt + 3_600_000, counter: 4, device: DEV });
    expect(clampHlc(future, receivedAt)).toEqual({
      hlc: formatHlc({ wall: receivedAt + 300_000, counter: 4, device: DEV }),
      clamped: true,
    });
  });
});
