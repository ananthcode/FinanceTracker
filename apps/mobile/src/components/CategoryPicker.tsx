import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryPath, indexCategories, searchCategories, type CategoryKind, type CategoryView } from "@ft/core";
import { Field, inputStyle, TextLink } from "./ui";

/**
 * Choose a category on Android (R3 FR-005, FR-022 on the phone): a field showing the chosen path;
 * tapping opens a full-screen search by any part of a name, with full paths, hidden categories left
 * out unless already chosen. Same rules as the web picker (packages/core searchCategories).
 */
export function CategoryPicker({
  label,
  categories,
  value,
  onChange,
  kind,
  exclude,
  noneLabel,
}: {
  label: string;
  categories: CategoryView[];
  value: string | null;
  onChange: (id: string | null) => void;
  kind?: CategoryKind;
  exclude?: ReadonlySet<string>;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const index = useMemo(() => indexCategories(categories), [categories]);
  const options = useMemo(() => {
    const matches = searchCategories(query, categories, { kind, selectedId: value })
      .filter((m) => !exclude?.has(m.category.id))
      .slice(0, 100)
      .map((m) => ({ id: m.category.id as string | null, label: m.path + (!kind && m.category.kind === "income" ? " · Income" : "") }));
    const q = query.trim().toLowerCase();
    return noneLabel !== undefined && noneLabel.toLowerCase().includes(q) ? [{ id: null, label: noneLabel }, ...matches] : matches;
  }, [query, categories, kind, value, exclude, noneLabel]);

  const shown = value ? categoryPath(value, index) : (noneLabel ?? "None");

  return (
    <Field label={label}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        accessibilityHint="Opens a list to search and choose"
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={inputStyle}
      >
        <Text>{shown}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: 20, fontWeight: "600" }}>
              {label}
            </Text>
            <TextLink label="Close" onPress={() => setOpen(false)} />
          </View>
          <TextInput accessibilityLabel="Search categories" placeholder="Type part of a name" value={query} onChangeText={setQuery} autoFocus style={inputStyle} />
          {options.length === 0 && <Text accessibilityLiveRegion="polite">No matching categories</Text>}
          <FlatList
            data={options}
            keyExtractor={(o) => o.id ?? "none"}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === value }}
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eaeef2" }}
              >
                <Text style={{ fontWeight: item.id === value ? "700" : "400" }}>{item.label}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </Field>
  );
}
