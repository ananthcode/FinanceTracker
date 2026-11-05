import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { parseAmountInput, personBalanceOf, todayInZone, type PayeeView } from "@ft/core";
import { Button } from "./Button";
import { Money } from "./Money";
import { useDisplay } from "./providers/DisplayProvider";
import { useSync, useSyncedData } from "./providers/SyncProvider";
import { useMoney } from "./providers/useLists";
import { Choice, inputStyle, Muted } from "./ui";
import { newId } from "@/lib/ids";
import { colours } from "@/lib/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
function shiftMonth(first: string, by: number): string {
  const d = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 10);
}

/** "1.5" → 15000 (percent per month × 10⁴); 0–10 % with up to four decimals (FR-013). */
export function parseRate(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const e4 = Number(whole) * 10000 + Number(frac.padEnd(4, "0"));
  return e4 <= 100000 ? e4 : null;
}

export const formatRate = (e4: number) => `${(e4 / 10000).toFixed(4).replace(/\.?0+$/, "")} %`;

/**
 * A person's interest on the phone (R4 US4; FR-013 – FR-015): the setting (none / automatic /
 * manual), the rate history (each rate from the 1st of a month) and recording interest by hand.
 * Automatic entries are proposed by the server at month end and wait in "To confirm".
 */
export function PersonInterest({ person }: { person: PayeeView }) {
  const { record, rows } = useSync();
  const { preferences } = useDisplay();
  const { personTotals } = useMoney();
  const rates = useSyncedData(
    async () =>
      (await rows("person_rate"))
        .filter((r) => r.payeeId === person.id)
        .map((r) => ({ id: r.id, effectiveMonth: String(r.effectiveMonth), rateE4: Number(r.rateE4) }))
        .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth)),
    [] as { id: string; effectiveMonth: string; rateE4: number }[],
  );
  const today = todayInZone(preferences.timezone);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [rateText, setRateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const balance = personBalanceOf(person, personTotals);

  const setMode = (interestMode: PayeeView["interestMode"]) =>
    void record({ entity: "payee", entityId: person.id, kind: "update", fields: { interestMode } });

  const addRate = async () => {
    const rateE4 = parseRate(rateText);
    if (rateE4 === null) return Alert.alert("Enter a monthly rate", "From 0 to 10 per cent, up to four decimals, e.g. 1.5");
    const same = rates.find((r) => r.effectiveMonth === month);
    if (same) await record({ entity: "person_rate", entityId: same.id, kind: "update", fields: { rateE4 } });
    else await record({ entity: "person_rate", entityId: newId(), kind: "create", fields: { payeeId: person.id, effectiveMonth: month, rateE4 } });
    setRateText("");
  };

  const removeRate = (id: string, label: string) =>
    Alert.alert("Remove rate?", `The rate from ${label} will be removed. Interest already recorded is not changed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void record({ entity: "person_rate", entityId: id, kind: "delete" }) },
    ]);

  const recordInterest = async () => {
    const parsed = parseAmountInput(amountText, { currency: preferences.baseCurrency });
    if (!parsed.ok || parsed.minor <= 0n) return Alert.alert("Enter an amount", "The interest must be more than zero.");
    // Interest follows the balance: on money they owe you it adds to what they owe, and the other way round.
    const flow = balance < 0n ? "in" : "out";
    await record({
      entity: "transaction",
      entityId: newId(),
      kind: "create",
      fields: { kind: "interest", date: today, payeeId: person.id, amountMinor: parsed.minor.toString(), flow, lines: [] },
    });
    setAmountText("");
    Alert.alert("Interest recorded", balance < 0n ? "It adds to what you owe them." : "It adds to what they owe you.");
  };

  return (
    <View style={{ gap: 12, marginTop: 16, borderTopWidth: 1, borderColor: colours.line, paddingTop: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600", color: colours.text }}>
        Interest
      </Text>
      <Choice
        label="Interest"
        options={[
          { value: "none", label: "None" },
          { value: "automatic", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ]}
        value={person.interestMode}
        onChange={setMode}
      />
      <Muted>
        {person.interestMode === "automatic"
          ? "At each month end a proposed entry — the month's rate × the balance at the start of the month — waits in To confirm."
          : person.interestMode === "manual"
            ? "Record interest by hand below; nothing is proposed automatically."
            : "No interest is charged or paid."}
      </Muted>

      {person.interestMode !== "none" && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "600", color: colours.text }}>Monthly rates</Text>
          {rates.length === 0 && <Muted>No rate yet.</Muted>}
          {rates.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colours.card, borderRadius: 12, padding: 12, gap: 8 }}>
              <Text style={{ flex: 1, color: colours.text }}>From {monthLabel(r.effectiveMonth)}</Text>
              <Text style={{ fontWeight: "600", color: colours.text }}>{formatRate(r.rateE4)} a month</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove rate from ${monthLabel(r.effectiveMonth)}`} hitSlop={8} onPress={() => removeRate(r.id, monthLabel(r.effectiveMonth))}>
                <Text style={{ color: colours.danger, fontWeight: "600" }}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colours.card, borderRadius: 12, borderWidth: 1, borderColor: colours.line }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Earlier month" hitSlop={6} onPress={() => setMonth(shiftMonth(month, -1))} style={{ padding: 10 }}>
                <Text>‹</Text>
              </Pressable>
              <Text style={{ fontWeight: "600", minWidth: 72, textAlign: "center" }}>{monthLabel(month)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Later month" hitSlop={6} onPress={() => setMonth(shiftMonth(month, 1))} style={{ padding: 10 }}>
                <Text>›</Text>
              </Pressable>
            </View>
            <TextInput accessibilityLabel="Monthly rate in per cent" placeholder="1.5" keyboardType="decimal-pad" value={rateText} onChangeText={setRateText} style={[inputStyle, { flex: 1 }]} />
            <Text>%</Text>
          </View>
          <Button label="Save rate" variant="outline" onPress={() => void addRate()} />
          <Muted>A rate starts on the 1st of its month. Months already ended keep the interest they had.</Muted>
        </View>
      )}

      {person.interestMode !== "none" && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "600", color: colours.text }}>Record interest by hand</Text>
          <Text style={{ color: colours.muted }}>
            Balance now: <Money value={balance < 0n ? -balance : balance} style={{ color: colours.muted }} /> {balance < 0n ? "you owe" : balance > 0n ? "owed to you" : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput accessibilityLabel="Interest amount" placeholder="Amount" keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} style={[inputStyle, { flex: 1 }]} />
            <Button label="Record" onPress={() => void recordInterest()} />
          </View>
        </View>
      )}
    </View>
  );
}
