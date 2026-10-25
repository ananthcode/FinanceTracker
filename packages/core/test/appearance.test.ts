import { describe, expect, it } from "vitest";
import { ACCOUNT_COLOURS, ACCOUNT_ICON_KEYS, ACCOUNT_TYPES, defaultAppearance } from "../src/accounts";

/** FR-008, research R2-10: 12 colours with ≥ 3:1 contrast on both card backgrounds. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("account appearance", () => {
  it("has 12 colours that meet 3:1 against the light and dark card backgrounds", () => {
    expect(Object.keys(ACCOUNT_COLOURS)).toHaveLength(12);
    for (const [key, c] of Object.entries(ACCOUNT_COLOURS)) {
      expect(contrast(c.light, "#ffffff"), `${key} light`).toBeGreaterThanOrEqual(3);
      expect(contrast(c.dark, "#0d1117"), `${key} dark`).toBeGreaterThanOrEqual(3);
    }
  });

  it("has a default colour and icon for every type", () => {
    for (const type of ACCOUNT_TYPES) {
      const d = defaultAppearance(type);
      expect(Object.keys(ACCOUNT_COLOURS)).toContain(d.colour);
      expect(ACCOUNT_ICON_KEYS).toContain(d.icon);
    }
    expect(new Set(ACCOUNT_ICON_KEYS).size).toBe(ACCOUNT_ICON_KEYS.length);
  });
});
