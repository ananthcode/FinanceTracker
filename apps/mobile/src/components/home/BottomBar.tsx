import type { Tabs } from "expo-router/js-tabs";
import { SymbolView } from "expo-symbols";
import { useState, type ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colours } from "@/lib/theme";
import { AddChooser } from "./AddChooser";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const SHOWN = [
  { name: "index", label: "Home", icon: { ios: "house", android: "home" } },
  { name: "accounts", label: "Accounts", icon: { ios: "wallet.pass", android: "account_balance_wallet" } },
] as const;

/** Bottom bar (docs/ANDROID-HOME.md): Home · large round + · Accounts. The active tab is also bold. */
export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);
  const active = state.routes[state.index]?.name;

  const tab = (t: (typeof SHOWN)[number]) => {
    const on = active === t.name;
    const colour = on ? colours.action : colours.muted;
    return (
      <Pressable
        key={t.name}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t.label}
        onPress={() => navigation.navigate(t.name)}
        style={{ alignItems: "center", minWidth: 72, paddingVertical: 4 }}
      >
        <SymbolView name={t.icon} size={24} tintColor={colour} />
        <Text style={{ color: colour, fontSize: 12, fontWeight: on ? "700" : "400" }}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: colours.card, borderTopWidth: 1, borderColor: colours.line, paddingTop: 6, paddingBottom: 6 + insets.bottom }}>
      {tab(SHOWN[0])}
      <Pressable
        testID="add-transaction"
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => setAdding(true)}
        style={{ width: 64, height: 64, borderRadius: 32, marginTop: -36, backgroundColor: colours.action, borderWidth: 5, borderColor: colours.page, alignItems: "center", justifyContent: "center", elevation: 6 }}
      >
        <SymbolView name={{ ios: "plus", android: "add" }} size={32} tintColor="#FFFFFF" />
      </Pressable>
      {tab(SHOWN[1])}
      <AddChooser visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}
