import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryPath, indexCategories } from "@ft/core";
import { Money } from "@/components/Money";
import { useLists, useMoney } from "@/components/providers/useLists";
import { colours } from "@/lib/theme";

type Kind = { key: "expense" | "income" | "transfer" | "refund" | "person" | "planned"; label: string; hint: string; icon: SymbolViewProps["name"]; bg: string };

const KINDS: Kind[] = [
  { key: "expense", label: "Expense", hint: "Money out", icon: { ios: "arrow.up.right", android: "north_east" }, bg: colours.expense },
  { key: "income", label: "Income", hint: "Money in", icon: { ios: "arrow.down.left", android: "south_west" }, bg: colours.income },
  { key: "transfer", label: "Transfer", hint: "Between accounts", icon: { ios: "arrow.left.arrow.right", android: "swap_horiz" }, bg: colours.action },
  { key: "refund", label: "Refund", hint: "Money back on a purchase", icon: { ios: "arrow.uturn.left", android: "undo" }, bg: colours.incomeInk },
  { key: "person", label: "Person", hint: "Lent, borrowed, repaid", icon: { ios: "person.2", android: "handshake" }, bg: "#993556" },
  { key: "planned", label: "Planned", hint: "Bill or EMI later", icon: { ios: "calendar.badge.clock", android: "event_repeat" }, bg: colours.plan },
];

/**
 * Step 1 of adding a transaction (docs/ANDROID-HOME.md): four large tiles over a dimmed Home, and
 * "Repeat a recent one" chips that open a recent expense ready to save. Planned payments arrive
 * with the Payment plan module (R5).
 */
export function AddChooser({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { transactions } = useMoney();
  const { categories } = useLists();
  const index = indexCategories(categories);
  const recent: typeof transactions = [];
  for (const t of [...transactions].sort((a, b) => b.date.localeCompare(a.date))) {
    if (t.kind !== "expense" || !t.categoryId || t.lines.length > 0 || t.state !== "active") continue;
    if (recent.some((r) => r.categoryId === t.categoryId)) continue;
    recent.push(t);
    if (recent.length === 3) break;
  }

  const choose = (k: Kind) => {
    onClose();
    if (k.key === "planned") return Alert.alert("Planned payments", "Bills and EMIs you plan ahead arrive with the Payment plan module.");
    router.push({ pathname: "/add", params: { kind: k.key } });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(247,247,251,0.94)", justifyContent: "flex-end", padding: 18 }}>
        {recent.length > 0 && (
          <View style={{ backgroundColor: colours.card, borderRadius: 18, padding: 12, marginBottom: 16, gap: 8 }}>
            <Text style={{ color: colours.muted, fontSize: 13 }}>Repeat a recent one</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {recent.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    router.push({ pathname: "/add", params: { kind: "expense", from: t.id } });
                  }}
                  style={{ flexDirection: "row", gap: 4, backgroundColor: "#FBEAF0", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 }}
                >
                  <Text style={{ color: "#72243E", fontWeight: "600" }}>{categoryPath(t.categoryId!, index).split(" › ").pop()}</Text>
                  <Money value={t.amountMinor} style={{ color: "#72243E" }} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {KINDS.map((k) => (
            <Pressable
              key={k.key}
              accessibilityRole="button"
              accessibilityLabel={`${k.label}, ${k.hint}`}
              onPress={() => choose(k)}
              style={{ width: "47.5%", backgroundColor: k.bg, borderRadius: 20, padding: 16, gap: 4 }}
            >
              <SymbolView name={k.icon} size={28} tintColor="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>{k.label}</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 12 }}>{k.hint}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ alignSelf: "center", marginTop: 18, width: 60, height: 60, borderRadius: 30, backgroundColor: colours.faint, alignItems: "center", justifyContent: "center" }}
        >
          <SymbolView name={{ ios: "xmark", android: "close" }} size={28} tintColor="#FFFFFF" />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}
