import { describe, expect, it } from "vitest";
import { fiscalYearOf, formatDate, formatTimestamp, isValidTimezone } from "../src/dates";

describe("formatDate (calendar dates, no timezone shift)", () => {
  it("supports all three formats", () => {
    expect(formatDate("2026-10-11", { dateFormat: "dd-MMM-yyyy" })).toBe("11-Oct-2026");
    expect(formatDate("2026-10-11", { dateFormat: "dd/MM/yyyy" })).toBe("11/10/2026");
    expect(formatDate("2026-10-11", { dateFormat: "yyyy-MM-dd" })).toBe("2026-10-11");
  });

  it("pads single-digit days and months", () => {
    expect(formatDate("2026-01-05", { dateFormat: "dd-MMM-yyyy" })).toBe("05-Jan-2026");
  });

  it("rejects malformed or impossible dates", () => {
    expect(() => formatDate("2026-02-30", { dateFormat: "dd-MMM-yyyy" })).toThrow();
    expect(() => formatDate("11-10-2026", { dateFormat: "dd-MMM-yyyy" })).toThrow();
  });
});

describe("formatTimestamp (UTC instant rendered in the user's timezone)", () => {
  it("shifts across midnight for Asia/Kolkata", () => {
    // 2026-03-31T19:00Z is 01-Apr-2026 00:30 in India.
    const prefs = { dateFormat: "dd-MMM-yyyy" as const, timezone: "Asia/Kolkata" };
    expect(formatTimestamp("2026-03-31T19:00:00Z", prefs)).toBe("01-Apr-2026");
    expect(formatTimestamp("2026-03-31T18:00:00Z", prefs)).toBe("31-Mar-2026");
  });

  it("uses UTC when asked", () => {
    expect(
      formatTimestamp("2026-03-31T19:00:00Z", { dateFormat: "yyyy-MM-dd", timezone: "UTC" }),
    ).toBe("2026-03-31");
  });
});

describe("fiscalYearOf", () => {
  it("defaults to an April–March year", () => {
    expect(fiscalYearOf("2026-03-31", 4)).toEqual({ startYear: 2025, endYear: 2026, label: "FY 2025-26" });
    expect(fiscalYearOf("2026-04-01", 4)).toEqual({ startYear: 2026, endYear: 2027, label: "FY 2026-27" });
  });

  it("treats January start as the calendar year", () => {
    expect(fiscalYearOf("2026-12-31", 1)).toEqual({ startYear: 2026, endYear: 2026, label: "FY 2026" });
  });

  it("rejects invalid start months", () => {
    expect(() => fiscalYearOf("2026-01-01", 0)).toThrow();
    expect(() => fiscalYearOf("2026-01-01", 13)).toThrow();
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("todayInZone (R2 FR-004)", () => {
  it("is the calendar date in the user's timezone, not UTC", async () => {
    const { todayInZone } = await import("../src/dates");
    // 20:00 UTC on 31 March is already 1 April in India.
    expect(todayInZone("Asia/Kolkata", new Date("2026-03-31T20:00:00Z"))).toBe("2026-04-01");
    expect(todayInZone("UTC", new Date("2026-03-31T20:00:00Z"))).toBe("2026-03-31");
  });
});
