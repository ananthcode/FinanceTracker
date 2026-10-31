import { AccountForm } from "@/components/AccountForm";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { accountFromRow, groupFromRow } from "@/lib/sync/accounts";

/** Add account on Android (R2 US1 on the phone, T062). */
export default function NewAccountScreen() {
  const { rows } = useSync();
  const { preferences } = useDisplay();
  const accounts = useSyncedData(async () => (await rows("account")).map((r) => accountFromRow(r, preferences.baseCurrency)), []);
  const groups = useSyncedData(async () => (await rows("account_group")).map(groupFromRow), [] as ReturnType<typeof groupFromRow>[]);
  return (
    <Screen title="Add account">
      <AccountForm account={null} accounts={accounts} groups={groups} />
    </Screen>
  );
}
