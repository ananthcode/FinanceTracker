import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Tabs } from "expo-router/js-tabs";
import { Text } from "react-native";
import { HeaderActions } from "@/components/HeaderActions";
import { useSession } from "@/components/providers/SessionProvider";

type SymbolName = SymbolViewProps["name"];

/** Bottom tabs (FR-034, contracts/client-shell.md); later modules replace the placeholders. */
const TABS: { name: string; title: string; icon: SymbolName }[] = [
  { name: "index", title: "Dashboard", icon: { ios: "square.grid.2x2", android: "dashboard" } },
  { name: "accounts", title: "Accounts", icon: { ios: "building.columns", android: "account_balance" } },
  { name: "transactions", title: "Transactions", icon: { ios: "arrow.left.arrow.right", android: "swap_horiz" } },
  { name: "payment-plan", title: "Payment plan", icon: { ios: "calendar", android: "calendar_month" } },
  { name: "settings", title: "Settings", icon: { ios: "gearshape", android: "settings" } },
];

export default function TabsLayout() {
  const { me } = useSession();
  const isOwner = me?.role === "owner";

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        // The active tab is also bold, so it is not marked by colour alone (Principle XIII).
        tabBarActiveTintColor: "#1f6feb",
        headerRight: () => <HeaderActions isOwner={isOwner} />,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <SymbolView name={tab.icon} size={size} tintColor={color} />,
            tabBarLabel: ({ focused, color }) => (
              <Text style={{ color, fontSize: 11, fontWeight: focused ? "700" : "400" }}>{tab.title}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
