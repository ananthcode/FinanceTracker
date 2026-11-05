import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { keyBetween, planMove, type GroupView } from "@ft/core";
import { Button } from "@/components/Button";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { groupFromRow } from "@/lib/sync/accounts";
import { newId } from "@/lib/ids";

const input = { flex: 1, borderWidth: 1, borderColor: "#E5E4DD", borderRadius: 8, padding: 10, fontSize: 16 } as const;
const byKey = (a: GroupView, b: GroupView) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1);

/** Your own account groups on Android (R2 FR-009a/b on the phone, T062): add, rename, reorder, delete. */
export default function GroupsScreen() {
  const { rows, record } = useSync();
  const groups = useSyncedData(async () => (await rows("account_group")).map(groupFromRow).sort(byKey), [] as GroupView[]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if ([...trimmed].length < 1 || [...trimmed].length > 30) return setError("Enter a name of 1–30 characters.");
    if (groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return setError("You already have a group with this name.");
    setError(null);
    await record({
      entity: "account_group",
      entityId: newId(),
      kind: "create",
      fields: { name: trimmed, sortKey: keyBetween(groups.at(-1)?.sortKey ?? null, null) },
      options: { onNameConflict: "suffix" },
    });
    setName("");
  }

  async function move(from: number, to: number) {
    for (const change of planMove(groups, from, to)) {
      await record({ entity: "account_group", entityId: change.id, kind: "update", fields: { sortKey: change.sortKey } });
    }
  }

  return (
    <Screen title="Groups">
      <Text style={{ color: "#5F5E5A" }}>
        Groups are your own way to arrange accounts, for example &quot;My accounts&quot; and &quot;Held for family&quot;. They never change a
        balance.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput accessibilityLabel="New group name" value={name} onChangeText={setName} maxLength={30} style={input} />
        <Button label="Add" onPress={() => void add()} />
      </View>
      {error && <Text accessibilityRole="alert" style={{ color: "#cf222e" }}>{error}</Text>}
      {groups.length === 0 && <Text>No groups yet.</Text>}
      {groups.map((g, i) => (
        <GroupRow
          key={g.id}
          group={g}
          onUp={i > 0 ? () => void move(i, i - 1) : undefined}
          onDown={i < groups.length - 1 ? () => void move(i, i + 1) : undefined}
          onRenamed={(next) => void record({ entity: "account_group", entityId: g.id, kind: "update", fields: { name: next } })}
          onDelete={() =>
            Alert.alert(`Delete the group ${g.name}?`, "Its accounts move to “Ungrouped”. No account or balance changes.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete group", style: "destructive", onPress: () => void record({ entity: "account_group", entityId: g.id, kind: "delete" }) },
            ])
          }
        />
      ))}
    </Screen>
  );
}

function GroupRow({
  group,
  onUp,
  onDown,
  onRenamed,
  onDelete,
}: {
  group: GroupView;
  onUp?: () => void;
  onDown?: () => void;
  onRenamed: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  return (
    <View style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: "#E5E4DD" }}>
      {editing ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput accessibilityLabel={`New name for ${group.name}`} value={name} onChangeText={setName} maxLength={30} style={input} autoFocus />
          <Button
            label="Save"
            onPress={() => {
              const trimmed = name.trim();
              if (trimmed && trimmed !== group.name) onRenamed(trimmed);
              setEditing(false);
            }}
          />
        </View>
      ) : (
        <Text style={{ fontWeight: "600" }}>{group.name}</Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <Link label="Rename" a11y={`Rename ${group.name}`} onPress={() => setEditing(true)} />
        {onUp && <Link label="Move up" a11y={`Move ${group.name} up`} onPress={onUp} />}
        {onDown && <Link label="Move down" a11y={`Move ${group.name} down`} onPress={onDown} />}
        <Link label="Delete" a11y={`Delete ${group.name}`} onPress={onDelete} />
      </View>
    </View>
  );
}

function Link({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={8}>
      <Text style={{ color: "#534AB7", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
