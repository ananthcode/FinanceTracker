import { useContext, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { HeaderShownContext } from "expo-router/react-navigation";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Basic screen frame with a title, used by simple and placeholder screens. When the navigator
 * already shows a header with the title, the frame neither repeats it nor adds a top inset.
 */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  const headerShown = useContext(HeaderShownContext);
  return (
    <SafeAreaView edges={headerShown ? ["left", "right", "bottom"] : undefined} style={{ flex: 1, backgroundColor: "#F7F7FB" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!headerShown && (
          <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: "600" }}>
            {title}
          </Text>
        )}
        <View style={{ gap: 12 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
