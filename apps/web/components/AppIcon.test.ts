import { APPEARANCE_ICON_KEYS } from "@ft/core";
import { describe, expect, it } from "vitest";
import { ICONS } from "./AppIcon";

describe("AppIcon", () => {
  it("renders every icon key from packages/core (R3-09)", () => {
    for (const key of APPEARANCE_ICON_KEYS) expect(ICONS[key], key).toBeDefined();
    expect(new Set(Object.values(ICONS)).size).toBe(APPEARANCE_ICON_KEYS.length);
  });
});
