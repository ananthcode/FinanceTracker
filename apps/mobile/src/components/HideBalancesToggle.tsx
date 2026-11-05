import { SymbolView } from "expo-symbols";
import { Pressable } from "react-native";
import { useDisplay } from "./providers/DisplayProvider";

/**
 * Hide-balances switch in every tab header (R1 US7, T117; FR-031 – FR-033). Per device, applies to
 * every <Money> at once; the state is in the label as well as the icon (Principle XIII).
 */
export function HideBalancesToggle() {
  const { hideBalances, setHideBalances } = useDisplay();
  return (
    <Pressable
      testID="hide-balances"
      accessibilityRole="switch"
      accessibilityLabel="Hide balances"
      accessibilityState={{ checked: hideBalances }}
      hitSlop={8}
      onPress={() => setHideBalances(!hideBalances)}
      style={{ padding: 4 }}
    >
      <SymbolView
        name={hideBalances ? { ios: "eye.slash", android: "visibility_off" } : { ios: "eye", android: "visibility" }}
        size={24}
        tintColor="#534AB7"
      />
    </Pressable>
  );
}
