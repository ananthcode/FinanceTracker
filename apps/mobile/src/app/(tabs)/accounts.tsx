import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import {
  ACCOUNT_TYPE_GROUP_TITLE,
  ACCOUNT_TYPE_LABEL,
  BALANCE_LABEL_TEXT,
  summarise,
  type AccountView,
  type AccountsView,
  type SummaryRow,
} from "@ft/core";
import { Button } from "@/components/Button";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { useSync, useSyncedData } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { api } from "@/lib/api";
import { accountFromRow, groupFromRow } from "@/lib/sync/accounts";
import { useMoney } from "@/components/providers/useLists";

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
  const groups = useSyncedData(async () => (await rows("account_group")).map(groupFromRow), [] as ReturnType<typeof groupFromRow>[]);
  const { movements } = useMoney();
  const { me, refreshMe } = useSession();
  const [view, setView] = useState<AccountsView>(me?.preferences.accountsView ?? "by_type");
  const summary = summarise(accounts, { view, groups, movements });
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <ViewSwitch
          value={view}
          onChange={async (next) => {
            setView(next);
            // The chosen view follows the user to every device (FR-009); it needs a connection to save.
            try {
              await api("/api/me/preferences", { method: "PATCH", body: { accountsView: next } });
              await refreshMe();
            } catch {
              Alert.alert("Not saved", "The view changed on this phone only; it will be remembered once you are online and switch again.");
            }
          }}
        />
        <TextLink label="Manage groups" onPress={() => router.push("/accounts/groups")} />
        <TextLink label="Arrange" onPress={() => router.push("/accounts/arrange")} />
      </View>

      {summary.sections.map((section) => (
        <View key={section.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
              {section.type ? ACCOUNT_TYPE_GROUP_TITLE[section.type] : section.group ? section.group.name : "Ungrouped"}
            </Text>
            <Text>
              <Money value={section.subtotal} style={{ fontWeight: "600" }} />
              {section.subtotalKind === "net" ? " net" : ""}
            </Text>
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

function ViewSwitch({ value, onChange }: { value: AccountsView; onChange: (v: AccountsView) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Group accounts" style={{ flexDirection: "row", gap: 8 }}>
      {([["by_type", "By type"], ["my_groups", "My groups"]] as const).map(([v, label]) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === v }}
          onPress={() => value !== v && onChange(v)}
          style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: value === v ? 2 : 1, borderColor: value === v ? "#1f6feb" : "#d0d7de" }}
        >
          <Text style={{ fontWeight: value === v ? "700" : "400" }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={{ color: "#1f6feb", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
