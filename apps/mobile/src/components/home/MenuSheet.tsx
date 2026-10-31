import { router, type Href } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/components/providers/SessionProvider";
import { colours, tiles } from "@/lib/theme";

type Tile = { label: string; href: Href; icon: SymbolViewProps["name"]; tone: keyof typeof tiles };

const TILES: Tile[] = [
  { label: "People", href: "/people", icon: { ios: "person.2", android: "group" }, tone: "purple" },
  { label: "Categories", href: "/settings/categories", icon: { ios: "square.grid.2x2", android: "category" }, tone: "coral" },
  { label: "Payees", href: "/settings/payees", icon: { ios: "storefront", android: "storefront" }, tone: "teal" },
  { label: "Tags", href: "/settings/tags", icon: { ios: "tag", android: "sell" }, tone: "pink" },
  { label: "Plan", href: "/payment-plan", icon: { ios: "calendar", android: "event_upcoming" }, tone: "amber" },
  { label: "Dashboard", href: "/dashboard", icon: { ios: "chart.pie", android: "pie_chart" }, tone: "blue" },
];

/**
 * The menu (docs/ANDROID-HOME.md): opened by dragging down from the top of Home or by the menu
 * button; closed by tapping outside, Back, or a destination. Everything not on the bottom bar.
 */
export function MenuSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { me } = useSession();
  const go = (href: Href) => {
    onClose();
    router.push(href);
  };
  const row = (label: string, href: Href) => (
    <Pressable accessibilityRole="button" onPress={() => go(href)} style={{ paddingVertical: 10 }}>
      <Text style={{ fontSize: 15, color: colours.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(27,26,46,0.35)" }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: colours.card, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }}>
          <View style={{ padding: 16, gap: 12 }}>
            <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600", color: colours.text }}>
              Menu
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TILES.map((t) => (
                <Pressable
                  key={t.label}
                  accessibilityRole="button"
                  onPress={() => go(t.href)}
                  style={{ width: "31.5%", backgroundColor: tiles[t.tone].bg, borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 4 }}
                >
                  <SymbolView name={t.icon} size={26} tintColor={tiles[t.tone].ink} />
                  <Text style={{ color: tiles[t.tone].ink, fontSize: 13 }}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ borderTopWidth: 1, borderColor: colours.line, paddingTop: 4 }}>
              {row("Settings", "/settings")}
              {row("App lock", "/settings/app-lock")}
              {me?.role === "owner" && row("User management", "/admin")}
            </View>
            <View style={{ height: 5, width: 44, backgroundColor: "#B4B2A9", borderRadius: 3, alignSelf: "center" }} />
          </View>
        </SafeAreaView>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={{ flex: 1 }} onPress={onClose} />
      </View>
    </Modal>
  );
}
