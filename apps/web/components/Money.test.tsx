import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@ft/core";
import { Money } from "./Money";

/** T114 (web): the mask never reveals the digit count; switching off restores the amount at once. */
let hideBalances = false;
vi.mock("@/components/providers/DisplayProvider", () => ({
  useDisplay: () => ({ preferences: DEFAULT_PREFERENCES, hideBalances, setHideBalances: () => undefined }),
}));

const render = (value: bigint) => renderToStaticMarkup(<Money value={value} currency="INR" />);
const text = (html: string) => html.replace(/<[^>]+>/g, "");

beforeEach(() => {
  hideBalances = false;
});

describe("Money with hide-balances (FR-032)", () => {
  it("shows the formatted amount when off", () => {
    expect(text(render(123456700n))).toBe("₹12,34,567.00");
  });

  it("masks every amount identically, whatever its size or sign", () => {
    hideBalances = true;
    const outputs = [0n, 5n, 123456700n, 99999999999900n, -4200n].map((v) => text(render(v)));
    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toBe("₹••••");
    expect(outputs[0]).not.toMatch(/\d/);
  });

  it("labels the masked value for screen readers without the amount", () => {
    hideBalances = true;
    expect(render(123456700n)).toContain('aria-label="Amount hidden"');
  });

  it("shows the amount again as soon as it is switched off", () => {
    hideBalances = true;
    expect(text(render(500n))).toBe("₹••••");
    hideBalances = false;
    expect(text(render(500n))).toBe("₹5.00");
  });
});
