import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { compareNames, type TagView } from "@ft/core";
import { Button } from "@/components/Button";
import { useSync } from "@/components/providers/SyncProvider";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";
import { SearchPicker } from "@/components/SearchPicker";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { ErrorText, LabeledInput, TextLink } from "@/components/ui";
import { newId } from "@/lib/ids";

const sameName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) === 0;

/** Tags on Android (R3 US4 on the phone; FR-026 – FR-029): add, rename, merge, delete — offline. */
export default function TagsScreen() {
  const { tags } = useLists();
  const { record } = useSync();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TagView | null>(null);
  const [rename, setRename] = useState("");
  const [merging, setMerging] = useState<TagView | null>(null);
  const sorted = useMemo(() => tags.slice().sort((a, b) => compareNames(a.name, b.name)), [tags]);

  const check = (value: string, selfId?: string) => {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.length > 30) return "Enter a name of up to 30 characters.";
    if (tags.some((t) => t.id !== selfId && sameName(t.name, trimmed))) return "A tag with this name already exists.";
    return null;
  };

  const add = async () => {
    const problem = check(name);
    if (problem) return setError(problem);
    await record({ entity: "tag", entityId: newId(), kind: "create", fields: { name: name.trim() } });
    setName("");
    setError(null);
  };

  const saveRename = async () => {
    if (!editing) return;
    const problem = check(rename, editing.id);
    if (problem) return setError(problem);
    if (rename.trim() !== editing.name) await record({ entity: "tag", entityId: editing.id, kind: "update", fields: { name: rename.trim() } });
    setEditing(null);
    setError(null);
  };

  const remove = (tag: TagView) =>
    Alert.alert("Delete tag?", `"${tag.name}" will be deleted and removed from anything that has it.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void record({ entity: "tag", entityId: tag.id, kind: "delete" }) },
    ]);

  const merge = (source: TagView, targetId: string) => {
    const target = tags.find((t) => t.id === targetId);
    setMerging(null);
    if (!target) return;
    Alert.alert("Merge tag?", `Everything tagged "${source.name}" will be tagged "${target.name}", and "${source.name}" is removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Merge", style: "destructive", onPress: () => void record({ entity: "tag", entityId: source.id, kind: "merge", fields: { targetId } }) },
    ]);
  };

  return (
    <Screen title="Tags">
      <SyncStatusBar />
      <LabeledInput label="New tag" value={name} onChangeText={setName} maxLength={30} onSubmitEditing={() => void add()} />
      <Button label="Add tag" onPress={() => void add()} />
      {error && <ErrorText>{error}</ErrorText>}
      {sorted.length === 0 && <Text>No tags yet. Tags let you group records across categories, such as a trip or a project.</Text>}
      {sorted.map((t) =>
        editing?.id === t.id ? (
          <View key={t.id} style={{ gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: "#eaeef2" }}>
            <LabeledInput label={`Rename ${t.name}`} value={rename} onChangeText={setRename} maxLength={30} autoFocus />
            <View style={{ flexDirection: "row", gap: 16 }}>
              <TextLink label="Save" onPress={() => void saveRename()} />
              <TextLink label="Cancel" onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: "#eaeef2" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Renames the tag"
              style={{ flex: 1 }}
              onPress={() => {
                setEditing(t);
                setRename(t.name);
              }}
            >
              <Text>{t.name}</Text>
            </Pressable>
            {tags.length > 1 && <TextLink label="Merge" a11y={`Merge ${t.name}`} onPress={() => setMerging(t)} />}
            <TextLink label="Delete" a11y={`Delete ${t.name}`} onPress={() => remove(t)} />
          </View>
        ),
      )}
      <SearchPicker
        visible={merging !== null}
        title={merging ? `Merge "${merging.name}" into` : ""}
        options={sorted.filter((t) => t.id !== merging?.id).map((t) => ({ id: t.id, label: t.name }))}
        onPick={(id) => merging && merge(merging, id)}
        onClose={() => setMerging(null)}
      />
    </Screen>
  );
}
