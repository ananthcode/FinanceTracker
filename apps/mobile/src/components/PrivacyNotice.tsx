import { Text, View } from "react-native";

/** FR-036e: shown before joining. Same wording as the web PrivacyNotice. */
export function PrivacyNotice() {
  return (
    <View
      accessibilityRole="summary"
      style={{ borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 12, gap: 6 }}
    >
      <Text accessibilityRole="header" style={{ fontWeight: "600" }}>
        Before you join
      </Text>
      <Text>• We store your name, email, sign-in times and the financial records you enter.</Text>
      <Text>
        • The owner of this app can see your name, email, whether your access is active and when you last signed
        in — never your financial data.
      </Text>
      <Text>• You can ask the owner to permanently erase you and all your data at any time.</Text>
    </View>
  );
}
