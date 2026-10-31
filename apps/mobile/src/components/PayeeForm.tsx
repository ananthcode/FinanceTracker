import { router } from "expo-router";
import { useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import {
  canMergePayee,
  compareNames,
  formatAmountInput,
  mergedOpeningBalance,
  parseAmountInput,
  personBalance,
  personLabel,
  PERSON_LABEL_TEXT,
  todayInZone,
  type CategoryView,
  type PayeeKind,
  type PayeeView,
} from "@ft/core";
import { Button } from "./Button";
import { CategoryPicker } from "./CategoryPicker";
import { Money, useMoneyText } from "./Money";
import { useDisplay } from "./providers/DisplayProvider";
import { useSync } from "./providers/SyncProvider";
import { SearchPicker } from "./SearchPicker";
import { Choice, ErrorText, LabeledInput, Muted } from "./ui";

/**
 * Add or edit a payee or person on Android (R3 US2, US3, US5 on the phone; T071, T072). Saved on
 * the phone at once and sent automatically; names that clash with another device's are kept and
 * renamed " (2)" when synced (FR-032). Merges and deletes are checked by the server when they arrive
 * (FR-033); a refused one is reported in the sync bar.
 */
export function PayeeForm({
  payee,
  payees,
  categories,
  fixedKind,
}: {
  payee: PayeeView | null;
  payees: PayeeView[];
  categories: CategoryView[];
  fixedKind?: PayeeKind;
}) {
  const { record } = useSync();
  const { preferences } = useDisplay();
  const today = todayInZone(preferences.timezone);
  const opening = payee?.openingBalanceMinor ?? 0n;
  const [name, setName] = useState(payee?.name ?? "");
  const [kind, setKind] = useState<PayeeKind>(payee?.kind ?? fixedKind ?? "business");
  const [direction, setDirection] = useState<"they_owe" | "i_owe">(opening < 0n ? "i_owe" : "they_owe");
  const [amount, setAmount] = useState(opening !== 0n ? formatAmountInput(opening < 0n ? -opening : opening) : "");
  const [date, setDate] = useState(payee?.openingBalanceDate ?? today);
  const [include, setInclude] = useState(payee?.includeInNetWorth ?? false);
  const [categoryId, setCategoryId] = useState<string | null>(payee?.defaultCategoryId ?? null);
  const [notes, setNotes] = useState(payee?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const person = kind === "person";

  function validate(): Record<string, unknown> | null {
    const trimmed = name.trim();
    if ([...trimmed].length < 1 || [...trimmed].length > 60) return fail("Enter a name of 1–60 characters.");
    if (payees.some((p) => p.id !== payee?.id && p.name.toLowerCase() === trimmed.toLowerCase())) return fail("You already have a payee with this name.");
    if ([...notes].length > 500) return fail("Use at most 500 characters for notes.");
    const fields: Record<string, unknown> = { name: trimmed, kind, defaultCategoryId: categoryId, notes: notes.trim() === "" ? null : notes };
    if (person) {
      const parsed = parseAmountInput(amount.trim() === "" ? "0" : amount);
      if (!parsed.ok) return fail("Enter an amount like 15,000.00, without a minus sign.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return fail("Enter the date as yyyy-mm-dd, today or earlier.");
      fields.openingBalanceMinor = (direction === "i_owe" ? -parsed.minor : parsed.minor).toString();
      fields.openingBalanceDate = date;
      fields.includeInNetWorth = include;
    }
    return fields;
  }

  function fail(message: string): null {
    setError(message);
    return null;
  }

  async function save() {
    setError(null);
    const fields = validate();
    if (!fields) return;
    if (!payee) {
      await record({ entity: "payee", entityId: globalThis.crypto.randomUUID(), kind: "create", fields, options: { onNameConflict: "suffix" } });
    } else {
      if (payee.kind === "person" && kind === "business" && personBalance(payee) !== 0n) {
        return fail("Settle this person's balance to ₹0.00 before making them a business.");
      }
      const before: Record<string, unknown> = {
        name: payee.name,
        kind: payee.kind,
        defaultCategoryId: payee.defaultCategoryId,
        notes: payee.notes,
        openingBalanceMinor: payee.openingBalanceMinor.toString(),
        openingBalanceDate: payee.openingBalanceDate,
        includeInNetWorth: payee.includeInNetWorth,
      };
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => before[k] !== v));
      if (Object.keys(changed).length > 0) await record({ entity: "payee", entityId: payee.id, kind: "update", fields: changed });
    }
    router.back();
  }

  return (
    <View style={{ gap: 14 }}>
      {error && <ErrorText>{error}</ErrorText>}
      {payee?.kind === "person" && (
        <Text>
          Balance: <BalanceWords balance={personBalance(payee)} />
        </Text>
      )}
      <LabeledInput label="Name" value={name} onChangeText={setName} maxLength={60} />
      {!fixedKind && (
        <Choice
          label="This payee is"
          options={[
            { value: "business", label: "A business" },
            { value: "person", label: "A person" },
          ]}
          value={kind}
          onChange={setKind}
        />
      )}
      {person && (
        <>
          <Choice
            label="Opening balance"
            options={[
              { value: "they_owe", label: "They owe me" },
              { value: "i_owe", label: "I owe them" },
            ]}
            value={direction}
            onChange={setDirection}
          />
          <LabeledInput label="Amount (empty when settled)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
          <LabeledInput label="Balance on (yyyy-mm-dd)" value={date} onChangeText={setDate} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ flex: 1 }}>Include in net worth</Text>
            <Switch accessibilityLabel="Include in net worth" value={include} onValueChange={setInclude} />
          </View>
          <Muted>When on, what they owe you adds to Owned (or what you owe them to Owed) on Accounts.</Muted>
        </>
      )}
      <CategoryPicker label="Default category (optional)" categories={categories} value={categoryId} onChange={setCategoryId} noneLabel="No default category" />
      <LabeledInput label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={500} multiline style={{ minHeight: 60 }} />
      <Button label={payee ? "Save" : person ? "Add person" : "Add payee"} onPress={() => void save()} />
      {payee && <ManagePayee payee={payee} payees={payees} />}
    </View>
  );
}

/** "owes you ₹X" / "you owe ₹X" / "settled" — words, never sign or colour alone (FR-018). */
export function BalanceWords({ balance }: { balance: bigint }) {
  const label = personLabel(balance);
  if (label === "settled") return <Text>{PERSON_LABEL_TEXT.settled}</Text>;
  return (
    <Text>
      {PERSON_LABEL_TEXT[label]} <Money value={balance < 0n ? -balance : balance} />
    </Text>
  );
}

function ManagePayee({ payee, payees }: { payee: PayeeView; payees: PayeeView[] }) {
  const { record } = useSync();
  const moneyText = useMoneyText();
  const [picking, setPicking] = useState(false);
  const noun = payee.kind === "person" ? "person" : "payee";
  const targets = payees.filter((p) => canMergePayee(payee, p)).sort((a, b) => compareNames(a.name, b.name));

  function confirmMerge(targetId: string) {
    setPicking(false);
    const target = targets.find((t) => t.id === targetId)!;
    const combined = payee.kind === "person" ? ` Their balances are added: ${formatCombined(mergedOpeningBalance(payee, target), (v) => moneyText(v))}.` : "";
    Alert.alert(`Merge ${payee.name} into ${target.name}?`, `Everything that uses ${payee.name} will use ${target.name}, and ${payee.name} disappears.${combined}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Merge",
        style: "destructive",
        onPress: async () => {
          await record({ entity: "payee", entityId: payee.id, kind: "merge", fields: { targetId } });
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: "#eaeef2" }}>
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
        Manage {noun}
      </Text>
      <Button
        label={payee.hidden ? "Unhide" : "Hide"}
        variant="outline"
        onPress={() => void record({ entity: "payee", entityId: payee.id, kind: "update", fields: { hidden: !payee.hidden } }).then(() => router.back())}
      />
      <Muted>{payee.hidden ? `Hidden: not offered for new entries, kept on existing ones.` : `Hiding keeps this ${noun} on existing records.`}</Muted>
      {targets.length > 0 && <Button label={`Merge into another ${noun}`} variant="outline" onPress={() => setPicking(true)} />}
      <Button
        label="Delete"
        variant="outline"
        onPress={() =>
          Alert.alert(`Delete ${payee.name}?`, `${payee.name} disappears from every screen.`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                await record({ entity: "payee", entityId: payee.id, kind: "delete" });
                router.back();
              },
            },
          ])
        }
      />
      <SearchPicker
        visible={picking}
        title={`Merge ${payee.name} into`}
        options={targets.map((t) => ({ id: t.id, label: t.name }))}
        onPick={confirmMerge}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/** The combined balance in words for a plain-text dialog, through the shared money formatter. */
function formatCombined(balance: bigint, money: (v: bigint) => string): string {
  const label = personLabel(balance);
  if (label === "settled") return "settled";
  return `${PERSON_LABEL_TEXT[label]} ${money(balance < 0n ? -balance : balance)}`;
}
