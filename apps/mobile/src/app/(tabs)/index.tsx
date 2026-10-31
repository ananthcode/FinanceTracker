import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { summarise, type AccountView } from "@ft/core";
import { MenuSheet } from "@/components/home/MenuSheet";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { useLists } from "@/components/providers/useLists";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { accountFromRow } from "@/lib/sync/accounts";
import { colours } from "@/lib/theme";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Home — where the app opens (docs/ANDROID-HOME.md). Total balance, the month's income and expense
 * cards, cashflow and the month's transactions. Until R4 on Android the cards and list are empty;
 * the balance is real (accounts and included people, from the phone's store). Dragging down from
 * the top opens the menu; the menu button does the same for TalkBack users.
 */
export default function HomeScreen() {
  const { me } = useSession();
  const { preferences, hideBalances, setHideBalances } = useDisplay();
  const { rows } = useSync();
  const { payees } = useLists();
  const accounts = useSyncedData<AccountView[]>(async () => (await rows("account")).map((r) => accountFromRow(r, preferences.baseCurrency)), []);
  const total = summarise(accounts, { view: "by_type", people: payees.filter((p) => p.kind === "person") }).netWorth;
  const [menu, setMenu] = useState(false);
  const month = MONTHS[new Date().getMonth()];

  const pull = useMemo(
    () =>
      PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 2,
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 50) setMenu(true);
      },
    }),
    [],
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colours.page }}>
      <View {...pull.panHandlers} style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <View style={{ height: 5, width: 36, backgroundColor: "#D3D1C7", borderRadius: 3, alignSelf: "center", marginBottom: 8 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "600", color: colours.text, flex: 1 }} numberOfLines={1}>
            Hi {me?.displayName ?? "there"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colours.card, borderWidth: 1, borderColor: colours.line, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}>
            <SymbolView name={{ ios: "calendar", android: "calendar_month" }} size={16} tintColor={colours.text} />
            <Text style={{ fontWeight: "600", color: colours.text }}>{month}</Text>
          </View>
          <Pressable
            testID="hide-balances"
            accessibilityRole="switch"
            accessibilityLabel="Hide balances"
            accessibilityState={{ checked: hideBalances }}
            hitSlop={8}
            onPress={() => setHideBalances(!hideBalances)}
          >
            <SymbolView name={hideBalances ? { ios: "eye.slash", android: "visibility_off" } : { ios: "eye", android: "visibility" }} size={24} tintColor={colours.action} />
          </Pressable>
          <Pressable testID="open-menu" accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={8} onPress={() => setMenu(true)}>
            <SymbolView name={{ ios: "line.3.horizontal", android: "menu" }} size={26} tintColor={colours.text} />
          </Pressable>
        </View>
        <Text style={{ color: colours.muted, marginTop: 10 }}>Total balance</Text>
        <Money value={total} style={{ fontSize: 34, fontWeight: "700", color: colours.text }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <SyncStatusBar />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MonthCard label="Income" arrow="in" bg={colours.income} />
          <MonthCard label="Expenses" arrow="out" bg={colours.expense} />
        </View>
        <Text style={{ color: colours.incomeInk, fontWeight: "600" }}>Cashflow: none recorded yet</Text>
        <View style={{ backgroundColor: colours.card, borderRadius: 16, padding: 16, gap: 6 }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: colours.text }}>Your {month} transactions</Text>
          <Text style={{ color: colours.muted }}>
            Recording transactions on the phone arrives with the Transactions module. Then they will appear here by day, newest first.
          </Text>
        </View>
      </ScrollView>
      <MenuSheet visible={menu} onClose={() => setMenu(false)} />
    </SafeAreaView>
  );
}

function MonthCard({ label, arrow, bg }: { label: string; arrow: "in" | "out"; bg: string }) {
  return (
    <View accessibilityLabel={`${label} this month: none yet`} style={{ flex: 1, backgroundColor: bg, borderRadius: 16, padding: 14, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <SymbolView name={arrow === "in" ? { ios: "arrow.down.left", android: "south_west" } : { ios: "arrow.up.right", android: "north_east" }} size={16} tintColor="#FFFFFF" />
        <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>{label}</Text>
      </View>
      <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }}>—</Text>
    </View>
  );
}
