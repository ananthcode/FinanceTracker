import { Text, View } from "react-native";

/** "Offline" indicator (FR-036). Visibility is decided by StatusFrame from `useOffline`. */
export function OfflineBanner() {
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: "#5F5E5A", paddingHorizontal: 16, paddingVertical: 4 }}
    >
      <Text style={{ color: "white", fontSize: 12, textAlign: "center" }}>
        <Text style={{ fontWeight: "700" }}>Offline</Text> — showing what is saved on this phone
      </Text>
    </View>
  );
}
