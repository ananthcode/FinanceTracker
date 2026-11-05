import { Pressable, Text, View } from "react-native";
import { planMove, selectableAccounts, type AccountView } from "@ft/core";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { accountFromRow } from "@/lib/sync/accounts";

/**
 * Arrange accounts on Android (R2 FR-010 on the phone, T062): Move up / Move down, usable with
 * TalkBack. One order per user, shared with the web and both views.
 */
export default function ArrangeScreen() {
  const { rows, record } = useSync();
  const { preferences } = useDisplay();
  const accounts = useSyncedData(
    async () => selectableAccounts((await rows("account")).map((r) => accountFromRow(r, preferences.baseCurrency))),
    [] as AccountView[],
  );

  async function move(from: number, to: number) {
    for (const change of planMove(accounts, from, to)) {
      await record({ entity: "account", entityId: change.id, kind: "update", fields: { sortKey: change.sortKey } });
    }
  }

  return (
    <Screen title="Arrange accounts">
      <Text style={{ color: "#5F5E5A" }}>The order is the same in every view and on every device.</Text>
      {accounts.map((a, i) => (
        <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: "#E5E4DD" }}>
          <Text style={{ flex: 1, fontWeight: "600" }}>{a.name}</Text>
          {i > 0 && <MoveButton label="Up" a11y={`Move ${a.name} up`} onPress={() => void move(i, i - 1)} />}
          {i < accounts.length - 1 && <MoveButton label="Down" a11y={`Move ${a.name} down`} onPress={() => void move(i, i + 1)} />}
        </View>
      ))}
    </Screen>
  );
}

function MoveButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={8}>
      <Text style={{ color: "#534AB7", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
