import { Tabs } from "expo-router/js-tabs";
import { BottomBar } from "@/components/home/BottomBar";
import { HeaderActions } from "@/components/HeaderActions";
import { HideBalancesToggle } from "@/components/HideBalancesToggle";
import { useSession } from "@/components/providers/SessionProvider";
import { colours } from "@/lib/theme";

/**
 * Bottom bar (FR-034; docs/ANDROID-HOME.md): Home · + · Accounts. People, Payment plan and Settings
 * stay tab routes so their back stack keeps the bar, but are reached from the menu, not the bar.
 */
const HIDDEN: { name: string; title: string }[] = [
  { name: "people", title: "People" },
  { name: "payment-plan", title: "Payment plan" },
  { name: "settings", title: "Settings" },
];

export default function TabsLayout() {
  const { me } = useSession();
  const isOwner = me?.role === "owner";

  return (
    <Tabs
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colours.page },
        sceneStyle: { backgroundColor: colours.page },
        headerRight: () => (
          <HeaderActions isOwner={isOwner}>
            <HideBalancesToggle />
          </HeaderActions>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerShown: false }} />
      <Tabs.Screen name="accounts" options={{ title: "Accounts" }} />
      {HIDDEN.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title, href: null }} />
      ))}
    </Tabs>
  );
}
