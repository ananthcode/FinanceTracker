import { ScrollView, Text } from "react-native";

/** Placeholder for a tab whose module is not built yet (FR-034). The tab header carries the title. */
export function ComingSoon({ description }: { description: string }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Coming soon</Text>
      <Text style={{ color: "#6e7781" }}>{description}</Text>
    </ScrollView>
  );
}
