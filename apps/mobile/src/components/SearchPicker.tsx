import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { inputStyle, TextLink } from "./ui";

/** A full-screen searchable list to pick one item (merge targets on Android). */
export function SearchPicker({
  visible,
  title,
  options,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string }[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => q === "" || o.label.toLowerCase().includes(q));
  }, [options, query]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: 20, fontWeight: "600" }}>
            {title}
          </Text>
          <TextLink label="Close" onPress={onClose} />
        </View>
        <TextInput accessibilityLabel="Search" placeholder="Type part of a name" value={query} onChangeText={setQuery} style={inputStyle} />
        {shown.length === 0 && <Text>No matches</Text>}
        <FlatList
          data={shown}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => onPick(item.id)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: "#E5E4DD" }}>
              <Text>{item.label}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
