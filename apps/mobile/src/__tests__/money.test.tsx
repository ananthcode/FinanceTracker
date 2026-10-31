import { fireEvent, render, screen } from "@testing-library/react-native";
import { HideBalancesToggle } from "@/components/HideBalancesToggle";
import { Money } from "@/components/Money";
import { DisplayProvider } from "@/components/providers/DisplayProvider";

/** T114 (Android half) — R1 US7: masked amounts never reveal the digit count; turning it off restores at once. */

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined },
}));

async function renderAmounts() {
  return await render(
    <DisplayProvider>
      <HideBalancesToggle />
      <Money testID="small" value={5n} />
      <Money testID="large" value={123456789012n} />
    </DisplayProvider>,
  );
}

const text = (id: string) => String(screen.getByTestId(id).props.children);

describe("hide balances on Android", () => {
  it("shows amounts until the toggle is on", async () => {
    await renderAmounts();
    expect(text("large")).toMatch(/\d/);
    expect(screen.getByTestId("hide-balances").props.accessibilityState).toEqual({ checked: false });
  });

  it("masks every amount with the same text, whatever its size", async () => {
    await renderAmounts();
    await fireEvent.press(screen.getByTestId("hide-balances"));
    expect(text("small")).not.toMatch(/\d/);
    expect(text("small")).toBe(text("large"));
    expect(screen.getByTestId("large").props.accessibilityLabel).toBe("Amount hidden");
    expect(screen.getByTestId("hide-balances").props.accessibilityState).toEqual({ checked: true });
  });

  it("restores amounts immediately when turned off", async () => {
    await renderAmounts();
    await fireEvent.press(screen.getByTestId("hide-balances"));
    await fireEvent.press(screen.getByTestId("hide-balances"));
    expect(text("large")).toMatch(/\d/);
  });
});
