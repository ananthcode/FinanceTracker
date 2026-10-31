import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import {
  ACCOUNT_TYPE_GROUP_TITLE,
  ACCOUNT_TYPE_LABEL,
  BALANCE_LABEL_TEXT,
  summarise,
  type AccountView,
  type SummaryRow,
} from "@ft/core";
import { Button } from "@/components/Button";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { accountFromRow } from "@/lib/sync/accounts";

/**
 * Accounts on Android (R2 US5, T062): the same summary, groups by type and labels as the web,
 * read from the phone's own store, so it works offline (FR-030). Changes sync automatically.
 */
export default function AccountsScreen() {
  const { rows } = useSync();
  const { preferences } = useDisplay();
  const accounts = useSyncedData<AccountView[]>(
    async () => (await rows("account")).map((r) => accountFromRow(r, preferences.baseCurrency)),
    [],
  );
  const summary = summarise(accounts, { view: "by_type" });
  const active = accounts.filter((a) => a.state === "active");

  return (
    <Screen title="Accounts">
      <SyncStatusBar />
      {active.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Text>No accounts yet. Add the places your money is kept — a bank account, cash, a card or a wallet.</Text>
        </View>
      ) : (
        <View
          accessibilityLabel="Net worth summary"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, padding: 12, borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8 }}
        >
          <Figure label="Owned" value={summary.owned} />
          <Figure label="Owed" value={summary.owed} />
          <Figure label="Net worth" value={summary.netWorth} note={summary.netWorth < 0n ? "more owed than owned" : undefined} />
        </View>
      )}
      <Button label="Add account" onPress={() => router.push("/accounts/new")} />

      {summary.sections.map((section) => (
        <View key={section.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
              {section.type ? ACCOUNT_TYPE_GROUP_TITLE[section.type] : "Accounts"}
            </Text>
            <Money value={section.subtotal} style={{ fontWeight: "600" }} />
          </View>
          {section.rows.map((r) => (
            <AccountRow key={r.account.id} row={r} />
          ))}
        </View>
      ))}

      {summary.archived.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
            Archived accounts ({summary.archived.length})
          </Text>
          {summary.archived.map((r) => (
            <AccountRow key={r.account.id} row={r} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Figure({ label, value, note }: { label: string; value: bigint; note?: string }) {
  return (
    <View style={{ minWidth: 100 }}>
      <Text style={{ color: "#57606a" }}>{label}</Text>
      <Money value={value} style={{ fontSize: 18, fontWeight: "600" }} />
      {note && <Text style={{ color: "#57606a", fontSize: 12 }}>{note}</Text>}
    </View>
  );
}

function AccountRow({ row }: { row: SummaryRow<AccountView> }) {
  const { account, balance, label } = row;
  const notes = [
    label ? BALANCE_LABEL_TEXT[label] : null,
    row.excluded ? "excluded from net worth" : null,
    row.archivedWithBalance ? "archived with a balance" : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the account"
      onPress={() => router.push(`/accounts/${account.id}`)}
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: "#eaeef2" }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600" }}>{account.name}</Text>
        <Text style={{ color: "#57606a" }}>{ACCOUNT_TYPE_LABEL[account.type]}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Money value={balance} />
        {notes.length > 0 && <Text style={{ color: "#57606a", fontSize: 12 }}>{notes.join(" · ")}</Text>}
      </View>
    </Pressable>
  );
}
