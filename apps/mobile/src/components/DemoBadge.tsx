import { Text, View } from "react-native";

/** Persistent marker on every signed-in screen of the demo environment (FR-035). */
export function DemoBadge() {
  return (
    <View testID="demo-badge" style={{ backgroundColor: "#9a6700", paddingHorizontal: 16, paddingVertical: 4 }}>
      <Text style={{ color: "white", fontSize: 12, textAlign: "center" }}>
        <Text style={{ fontWeight: "700" }}>Demo</Text> environment — synthetic data only
      </Text>
    </View>
  );
}
