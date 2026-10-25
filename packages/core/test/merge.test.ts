import { describe, expect, it } from "vitest";
import { mergeFields } from "../src/sync/merge";
import vectors from "./vectors/merge.json";

/** T007 — per-field merge over the shared vectors (FR-030; same cases run against SQL). */
describe("mergeFields", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const result = mergeFields(c.fieldVersions as Record<string, string>, { fields: c.fields, hlc: c.hlc }, c.receivedAt);
      expect(result.applied).toEqual(c.applied);
      expect(result.ignored).toEqual(c.ignored);
      expect(result.clamped).toBe(c.clamped);
      expect(result.fieldVersions).toEqual(c.after);
    });
  }

  it("does not mutate its input", () => {
    const versions = { name: "1793011200000.0000.webbrw01" };
    mergeFields(versions, { fields: ["name"], hlc: "1793011300000.0000.webbrw01" }, 1793011300000);
    expect(versions).toEqual({ name: "1793011200000.0000.webbrw01" });
  });
});
