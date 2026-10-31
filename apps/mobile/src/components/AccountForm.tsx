import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPES,
  currentBalance,
  defaultAppearance,
  formatAmountInput,
  isOwedType,
  keyBetween,
  parseAmountInput,
  todayInZone,
  type AccountType,
  type AccountView,
  type AmountInputError,
  type GroupView,
} from "@ft/core";
import { Button } from "@/components/Button";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { newId } from "@/lib/ids";

const AMOUNT_MESSAGES: Record<AmountInputError, string> = {
  NOT_A_NUMBER: "Enter an amount like 52,340.50.",
  TOO_MANY_DECIMALS: "Use at most two decimal places.",
  OUT_OF_RANGE: "The amount is too large.",
  NEGATIVE_NOT_ALLOWED: "Enter an amount greater than zero.",
};

const input = { borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 10, fontSize: 16 } as const;

/**
 * Add or edit an account on Android (R2 US1, US3, US4 on the phone; T062). Saved to the phone at
 * once and sent automatically (FR-030). Names that clash with another device's are kept and renamed
 * " (2)" when synced (FR-032); here the user is warned about names this phone already knows.
 */
export function AccountForm({ account, accounts, groups }: { account: AccountView | null; accounts: AccountView[]; groups: GroupView[] }) {
  const { record } = useSync();
  const { preferences } = useDisplay();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [amount, setAmount] = useState(account ? formatAmountInput(account.openingBalanceMinor) : "");
  const [date, setDate] = useState(account?.openingBalanceDate ?? todayInZone(preferences.timezone));
  const [include, setInclude] = useState(account?.includeInNetWorth ?? true);
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [limit, setLimit] = useState(account?.creditLimitMinor ? formatAmountInput(account.creditLimitMinor) : "");
  const [groupId, setGroupId] = useState<string | null>(account?.groupId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const owed = isOwedType(type);
  const today = todayInZone(preferences.timezone);

  function validate(): Record<string, unknown> | null {
    const trimmed = name.trim();
    if ([...trimmed].length < 1 || [...trimmed].length > 40) return fail("Enter a name of 1–40 characters.");
    const clash = accounts.find((a) => a.id !== account?.id && a.state !== "deleted" && a.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) return fail(clash.state === "archived" ? "An archived account has this name — restore it or choose another name." : "You already have an account with this name.");
    const opening = parseAmountInput(amount.trim() === "" ? "0" : amount, { allowNegative: true });
    if (!opening.ok) return fail(AMOUNT_MESSAGES[opening.error]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Enter the date as yyyy-mm-dd.");
    if (date > today) return fail("The date must be today or earlier.");
    let credit: string | null = null;
    if (owed && limit.trim() !== "") {
      const parsed = parseAmountInput(limit);
      if (!parsed.ok || parsed.minor <= 0n) return fail("Enter a credit limit greater than zero, or leave it empty.");
      credit = parsed.minor.toString();
    }
    if ([...notes].length > 500) return fail("Use at most 500 characters for notes.");
    return {
      name: trimmed,
      type,
      openingBalanceMinor: opening.minor.toString(),
      openingBalanceDate: date,
      includeInNetWorth: include,
      notes: notes.trim() === "" ? null : notes,
      creditLimitMinor: owed ? credit : null,
      groupId,
    };
  }

  function fail(message: string): null {
    setError(message);
    return null;
  }

  async function save() {
    setError(null);
    const fields = validate();
    if (!fields) return;
    setBusy(true);
    try {
      if (!account) {
        const last = accounts.reduce<string | null>((max, a) => (max === null || a.sortKey > max ? a.sortKey : max), null);
        const appearance = defaultAppearance(type);
        await record({
          entity: "account",
          entityId: newId(),
          kind: "create",
          fields: { ...fields, ...appearance, sortKey: keyBetween(last, null) },
          options: { onNameConflict: "suffix" },
        });
      } else {
        const before: Record<string, unknown> = {
          name: account.name,
          type: account.type,
          openingBalanceMinor: account.openingBalanceMinor.toString(),
          openingBalanceDate: account.openingBalanceDate,
          includeInNetWorth: account.includeInNetWorth,
          notes: account.notes,
          creditLimitMinor: account.creditLimitMinor?.toString() ?? null,
          groupId: account.groupId,
        };
        const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => before[k] !== v));
        if (Object.keys(changed).length > 0) {
          if ("type" in changed && isOwedType(account.type) !== owed && !(await confirmTypeChange())) return;
          await record({ entity: "account", entityId: account.id, kind: "update", fields: changed });
        }
      }
      router.back();
    } finally {
      setBusy(false);
    }
  }

  function confirmTypeChange(): Promise<boolean> {
    return new Promise((resolve) =>
      Alert.alert(
        "Change what this account counts as?",
        owed
          ? "Its balance will count as money you owe, reducing your net worth."
          : "Its balance will count as money you own, increasing your net worth.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Change type", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      ),
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {error && (
        <Text accessibilityRole="alert" style={{ color: "#cf222e" }}>
          {error}
        </Text>
      )}
      <Field label="Name">
        <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} maxLength={40} style={input} />
      </Field>
      <Field label="Type">
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ACCOUNT_TYPES.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ checked: type === t }}
              onPress={() => setType(t)}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: type === t ? 2 : 1, borderColor: type === t ? "#1f6feb" : "#d0d7de" }}
            >
              <Text style={{ fontWeight: type === t ? "700" : "400" }}>{ACCOUNT_TYPE_LABEL[t]}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label={owed ? "Amount owed (minus if in credit)" : "Opening balance (minus if overdrawn)"}>
        <TextInput
          accessibilityLabel={owed ? "Amount owed" : "Opening balance"}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numbers-and-punctuation"
          placeholder="0.00"
          style={input}
        />
      </Field>
      <Field label="Balance on (yyyy-mm-dd)">
        <TextInput accessibilityLabel="Balance on" value={date} onChangeText={setDate} placeholder={today} style={input} />
      </Field>
      {owed && (
        <Field label="Credit limit (optional)">
          <TextInput accessibilityLabel="Credit limit" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" style={input} />
        </Field>
      )}
      {groups.length > 0 && (
        <Field label="Group">
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[{ id: null, name: "No group" }, ...[...groups].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))].map((g) => (
              <Pressable
                key={g.id ?? "none"}
                accessibilityRole="radio"
                accessibilityState={{ checked: groupId === g.id }}
                onPress={() => setGroupId(g.id)}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: groupId === g.id ? 2 : 1, borderColor: groupId === g.id ? "#1f6feb" : "#d0d7de" }}
              >
                <Text style={{ fontWeight: groupId === g.id ? "700" : "400" }}>{g.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text>Include in net worth</Text>
        <Switch accessibilityLabel="Include in net worth" value={include} onValueChange={setInclude} />
      </View>
      <Field label="Notes (optional)">
        <TextInput accessibilityLabel="Notes" value={notes} onChangeText={setNotes} maxLength={500} multiline style={[input, { minHeight: 60 }]} />
      </Field>
      <Button label={account ? "Save" : "Add account"} onPress={() => void save()} disabled={busy} />
      {account && <ManageAccount account={account} />}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

/** Archive (only at ₹0.00), restore and delete (FR-021 – FR-024), offline-capable. */
function ManageAccount({ account }: { account: AccountView }) {
  const { record } = useSync();
  const balance = currentBalance(account, []);

  async function act(kind: "archive" | "restore" | "delete") {
    await record({ entity: "account", entityId: account.id, kind });
    router.back();
  }

  return (
    <View style={{ gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: "#eaeef2" }}>
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
        Manage account
      </Text>
      {account.state === "archived" ? (
        <Button label="Restore" variant="outline" onPress={() => void act("restore")} />
      ) : balance === 0n ? (
        <Button label="Archive" variant="outline" onPress={() => void act("archive")} />
      ) : (
        <Text style={{ color: "#57606a" }}>
          This account can be archived when its balance is ₹0.00 — settle it or correct the opening balance first.
        </Text>
      )}
      <Button
        label="Delete"
        variant="outline"
        onPress={() =>
          Alert.alert(`Delete ${account.name}?`, "It disappears from every screen. Accounts with transactions are archived instead.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void act("delete") },
          ])
        }
      />
    </View>
  );
}
