import { Pressable, Text, View } from "react-native";

/**
 * "Service temporarily unavailable" (T104): the phone is online but the backend is unreachable or
 * paused. The app keeps working on what is saved on the phone, so this is a notice, not a block.
 */
export function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      testID="service-unavailable"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: "#cf222e",
        paddingHorizontal: 16,
        paddingVertical: 4,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <Text style={{ color: "white", fontSize: 12, flexShrink: 1 }}>
        <Text style={{ fontWeight: "700" }}>Service temporarily unavailable</Text> — showing what is saved on this
        phone
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
        <Text style={{ color: "white", fontSize: 12, fontWeight: "700", textDecorationLine: "underline" }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}
