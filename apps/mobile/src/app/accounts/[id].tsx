import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { AccountForm } from "@/components/AccountForm";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { accountFromRow, groupFromRow } from "@/lib/sync/accounts";

/** Edit account on Android (R2 US3, US4 on the phone, T062). */
export default function EditAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rows } = useSync();
  const { preferences } = useDisplay();
  const accounts = useSyncedData(async () => (await rows("account")).map((r) => accountFromRow(r, preferences.baseCurrency)), []);
  const groups = useSyncedData(async () => (await rows("account_group")).map(groupFromRow), [] as ReturnType<typeof groupFromRow>[]);
  const account = accounts.find((a) => a.id === id) ?? null;
  return (
    <Screen title="Edit account">
      {account ? <AccountForm key={account.id} account={account} accounts={accounts} groups={groups} /> : <Text>This account no longer exists.</Text>}
    </Screen>
  );
}
