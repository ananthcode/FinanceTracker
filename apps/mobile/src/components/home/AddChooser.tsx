import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colours } from "@/lib/theme";

type Kind = { label: string; hint: string; icon: SymbolViewProps["name"]; bg: string };

const KINDS: Kind[] = [
  { label: "Expense", hint: "Money out", icon: { ios: "arrow.up.right", android: "north_east" }, bg: colours.expense },
  { label: "Income", hint: "Money in", icon: { ios: "arrow.down.left", android: "south_west" }, bg: colours.income },
  { label: "Transfer", hint: "Between accounts", icon: { ios: "arrow.left.arrow.right", android: "swap_horiz" }, bg: colours.action },
  { label: "Planned", hint: "Bill or EMI later", icon: { ios: "calendar.badge.clock", android: "event_repeat" }, bg: colours.plan },
];

/**
 * Step 1 of adding a transaction (docs/ANDROID-HOME.md): four large tiles over a dimmed Home.
 * The amount, category and review steps arrive with R4 on Android; until then a tile says so.
 */
export function AddChooser({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const choose = (k: Kind) => {
    onClose();
    Alert.alert(`Add ${k.label.toLowerCase()}`, "Recording transactions on the phone arrives with the Transactions module.");
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(247,247,251,0.94)", justifyContent: "flex-end", padding: 18 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {KINDS.map((k) => (
            <Pressable
              key={k.label}
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
