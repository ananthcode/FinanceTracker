import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Basic screen frame with a title, used by simple and placeholder screens. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F7F7FB" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: "600" }}>
          {title}
        </Text>
        <View style={{ gap: 12 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
