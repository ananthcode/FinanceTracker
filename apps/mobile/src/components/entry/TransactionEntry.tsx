import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryPath, currentBalance, formatAmountInput, indexCategories, todayInZone, type TransactionView } from "@ft/core";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useLists, useMoney } from "@/components/providers/useLists";
import { useSync } from "@/components/providers/SyncProvider";
import { evaluateAmount } from "@/lib/calc";
import { colours } from "@/lib/theme";
import { AccountChips, AmountPad, CategoryChips } from "./parts";
import { newId } from "@/lib/ids";

export type EntryKind = "expense" | "income" | "transfer";
type Step = "amount" | "category" | "review";

const TONE: Record<EntryKind, string> = { expense: colours.expense, income: colours.income, transfer: colours.action };
const TITLE: Record<EntryKind, string> = { expense: "Expense", income: "Income", transfer: "Transfer" };

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Add or edit a transaction on the phone (R4 US8; docs/ANDROID-HOME.md steps 2–5). New entries go
 * amount → category → review (transfers: amount → review); editing opens on review. Saved through
 * the sync queue, so it works offline; the server applies the same rules and reports refusals.
 */
export function TransactionEntry({ kind, existing, prefill }: { kind: EntryKind; existing?: TransactionView; prefill?: TransactionView }) {
  const { record } = useSync();
  const { preferences } = useDisplay();
  const { categories, payees, tags } = useLists();
  const { accounts, transactions, movements } = useMoney();
  const today = todayInZone(preferences.timezone);
  const seed = existing ?? prefill;
  const active = accounts.filter((a) => a.state === "active");

  const lastOfKind = useMemo(() => [...transactions].filter((t) => t.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0], [transactions, kind]);
  const [step, setStep] = useState<Step>(existing || prefill ? "review" : "amount");
  const [expr, setExpr] = useState(seed ? formatAmountInput(seed.amountMinor, preferences.baseCurrency) : "");
  const [chosenAccount, setAccountId] = useState<string | null>(seed?.accountId ?? null);
  const accountId = chosenAccount ?? lastOfKind?.accountId ?? active[0]?.id ?? null;
  const [chosenTo, setToAccountId] = useState<string | null>(seed?.toAccountId ?? null);
  const toAccountId = chosenTo ?? (kind === "transfer" ? (lastOfKind?.toAccountId ?? null) : null);
  const [categoryId, setCategoryId] = useState<string | null>(seed?.categoryId ?? null);
  const [payeeId, setPayeeId] = useState<string | null>(seed?.payeeId ?? null);
  const [typedPayee, setPayeeText] = useState<string | null>(null);
  const payeeText = typedPayee ?? (payeeId ? (payees.find((p) => p.id === payeeId)?.name ?? "") : "");
  const [tagIds, setTagIds] = useState<string[]>(seed?.tagIds ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [date, setDate] = useState(existing?.date ?? today);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = evaluateAmount(expr.replace(/,/g, ""));
  const tone = TONE[kind];
  const catKind = kind === "income" ? "income" : "expense";
  const index = useMemo(() => indexCategories(categories), [categories]);
  const balances = useMemo(() => new Map(accounts.map((a) => [a.id, currentBalance(a, movements)])), [accounts, movements]);
  const suggested = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions.slice(-200)) if (t.kind === kind && t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
  }, [transactions, kind]);
  const payeeMatches = useMemo(() => {
    const q = payeeText.trim().toLowerCase();
    if (q === "" || payeeId) return [];
    return payees.filter((p) => !p.hidden && p.kind === "business" && p.name.toLowerCase().includes(q)).slice(0, 4);
  }, [payees, payeeText, payeeId]);

  const pickCategory = (id: string) => {
    const hasChildren = categories.some((c) => c.parentId === id && !c.hidden);
    setCategoryId(id);
    if (!hasChildren || categoryId === id) setStep("review");
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const save = async () => {
    if (amount === null || amount <= 0n) return Alert.alert("Enter an amount", "The amount must be more than zero.");
    if (!accountId) return Alert.alert("Choose an account");
    if (kind === "transfer" && (!toAccountId || toAccountId === accountId)) return Alert.alert("Choose two different accounts");
    setBusy(true);
    try {
      let payee = payeeId;
      const typed = payeeText.trim();
      if (kind !== "transfer" && !payee && typed !== "") {
        const same = payees.find((p) => p.name.localeCompare(typed, "en", { sensitivity: "base" }) === 0);
        if (same) payee = same.id;
        else {
          payee = newId();
          await record({ entity: "payee", entityId: payee, kind: "create", fields: { name: typed, kind: "business", defaultCategoryId: categoryId }, options: { onNameConflict: "suffix" } });
        }
      }
      const fields: Record<string, unknown> = {
        date,
        accountId,
        toAccountId: kind === "transfer" ? toAccountId : null,
        amountMinor: amount.toString(),
        payeeId: kind === "transfer" ? null : payee,
        categoryId: kind === "transfer" ? null : categoryId,
        tagIds,
        notes: notes.trim() === "" ? null : notes.trim(),
      };
      if (!existing) {
        await record({ entity: "transaction", entityId: newId(), kind: "create", fields: { kind, ...fields, lines: [] } });
      } else {
        const before: Record<string, unknown> = {
          date: existing.date,
          accountId: existing.accountId,
          toAccountId: existing.toAccountId,
          amountMinor: existing.amountMinor.toString(),
          payeeId: existing.payeeId,
          categoryId: existing.categoryId,
          tagIds: existing.tagIds,
          notes: existing.notes,
        };
        const changed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) if (JSON.stringify(v) !== JSON.stringify(before[k])) changed[k] = v;
        // A split keeps its lines on the web; on the phone the amount of a split is not edited.
        if ("amountMinor" in changed) changed.lines = existing.lines.length > 0 ? null : [];
        if (changed.lines === null) {
          setBusy(false);
          return Alert.alert("Edit the split on the web", "This transaction is split across categories. Change its amount on the web app.");
        }
        if (Object.keys(changed).length > 0) await record({ entity: "transaction", entityId: existing.id, kind: "update", fields: changed });
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    existing &&
    Alert.alert("Delete transaction?", "It will be removed from your balances on every device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void record({ entity: "transaction", entityId: existing.id, kind: "delete" }).then(close) },
    ]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={step === "amount" || existing ? "Close" : "Back"} hitSlop={10} onPress={() => (step === "amount" || existing ? close() : setStep(step === "review" && kind !== "transfer" ? "category" : "amount"))}>
        <SymbolView name={step === "amount" || existing ? { ios: "xmark", android: "close" } : { ios: "arrow.left", android: "arrow_back" }} size={24} tintColor={colours.text} />
      </Pressable>
      <View style={{ backgroundColor: tone, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>{existing ? `Edit ${TITLE[kind].toLowerCase()}` : TITLE[kind]}</Text>
      </View>
    </View>
  );

  if (step === "amount") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colours.page }}>
        {header}
        <View style={{ flex: 1, padding: 16, gap: 10 }}>
          <AccountChips label={kind === "income" ? "Into" : kind === "transfer" ? "From" : "Pay from"} accounts={active} value={accountId} onChange={setAccountId} balances={balances} />
          <View style={{ alignItems: "center", marginTop: 8 }}>
            {/[+−×÷]/.test(expr) && <Text style={{ color: colours.faint, fontSize: 15 }}>{expr} =</Text>}
            {amount !== null ? <Money value={amount} style={{ fontSize: 42, fontWeight: "700", color: colours.text }} /> : <Text style={{ fontSize: 42, fontWeight: "700", color: colours.faint }}>0</Text>}
          </View>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            {["100", "200", "500"].map((q) => (
              <Pressable key={q} accessibilityRole="button" onPress={() => setExpr(q)} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.card }}>
                <Text>₹{q}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <AmountPad expr={expr} onChange={setExpr} />
          <Pressable
            accessibilityRole="button"
            onPress={() => (amount !== null && amount > 0n ? setStep(kind === "transfer" ? "review" : "category") : Alert.alert("Enter an amount"))}
            style={{ backgroundColor: colours.income, borderRadius: 16, paddingVertical: 14, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>{kind === "transfer" ? "Next: accounts" : "Next: category"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === "category") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colours.page }}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <TextInput accessibilityLabel="Search categories" placeholder="Search categories" value={query} onChangeText={setQuery} style={{ backgroundColor: colours.card, borderRadius: 14, padding: 12, fontSize: 15 }} />
          <CategoryChips categories={categories} kind={catKind} suggested={suggested} query={query} value={categoryId} onPick={pickCategory} />
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, padding: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => setStep("review")} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.card }}>
            <Text style={{ fontWeight: "600" }}>{categoryId ? "Next" : "Skip"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colours.page }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        {kind !== "transfer" && (
          <View style={{ gap: 6 }}>
            <TextInput
              accessibilityLabel="Payee or title"
              placeholder="Payee or title"
              value={payeeText}
              onChangeText={(t) => {
                setPayeeText(t);
                setPayeeId(null);
              }}
              style={{ fontSize: 22, fontWeight: "600", borderBottomWidth: 1, borderColor: colours.line, paddingVertical: 6 }}
            />
            {payeeMatches.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {payeeMatches.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setPayeeId(p.id);
                      setPayeeText(p.name);
                      if (!categoryId && p.defaultCategoryId) setCategoryId(p.defaultCategoryId);
                    }}
                    style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.card }}
                  >
                    <Text>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Change category" onPress={() => setStep("category")} style={{ alignSelf: "flex-start", backgroundColor: colours.actionTint, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, marginTop: 4 }}>
              <Text style={{ color: colours.actionInk, fontWeight: "600" }}>{categoryId ? categoryPath(categoryId, index) : "Uncategorised"} ›</Text>
            </Pressable>
          </View>
        )}
        {kind === "transfer" && (
          <View style={{ gap: 12 }}>
            <AccountChips label="From" accounts={active} value={accountId} onChange={setAccountId} balances={balances} tone={colours.expense} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Swap accounts"
              onPress={() => {
                setAccountId(toAccountId);
                setToAccountId(accountId);
              }}
              style={{ alignSelf: "center", width: 42, height: 42, borderRadius: 21, backgroundColor: colours.action, alignItems: "center", justifyContent: "center" }}
            >
              <SymbolView name={{ ios: "arrow.up.arrow.down", android: "swap_vert" }} size={22} tintColor="#FFFFFF" />
            </Pressable>
            <AccountChips label="To" accounts={active.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} balances={balances} tone={colours.income} />
          </View>
        )}
        {tags.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colours.muted, fontSize: 13 }}>Tags</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: on ? colours.actionTint : colours.card, borderWidth: 1, borderColor: on ? colours.action : colours.line }}>
                    <Text style={{ color: on ? colours.actionInk : colours.text }}>{on ? "✓ " : ""}{t.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <TextInput accessibilityLabel="Note" placeholder="Add note" value={notes} onChangeText={setNotes} maxLength={1000} multiline style={{ backgroundColor: colours.card, borderRadius: 14, padding: 12, fontSize: 15 }} />
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colours.card, borderRadius: 14, padding: 8, gap: 6 }}>
          <Text style={{ color: colours.muted, flex: 1, paddingLeft: 4 }}>Date</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Day before" onPress={() => setDate(shiftDate(date, -1))} hitSlop={6} style={{ padding: 6 }}>
            <Text style={{ fontSize: 18 }}>‹</Text>
          </Pressable>
          <Text style={{ fontWeight: "600", minWidth: 96, textAlign: "center" }}>{date === today ? "Today" : date === shiftDate(today, -1) ? "Yesterday" : date}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Day after" onPress={() => setDate(shiftDate(date, 1))} hitSlop={6} style={{ padding: 6 }}>
            <Text style={{ fontSize: 18 }}>›</Text>
          </Pressable>
        </View>
        {date > today && <Text style={{ color: colours.plan }}>Upcoming — it will wait in “To confirm” until the date.</Text>}
        {existing && (
          <Pressable accessibilityRole="button" onPress={remove} style={{ alignSelf: "flex-start", paddingVertical: 8 }}>
            <Text style={{ color: colours.danger, fontWeight: "600" }}>Delete transaction</Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={{ backgroundColor: colours.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 10, elevation: 8 }}>
        {kind !== "transfer" && <AccountChips label={kind === "income" ? "Into" : "Pay with"} accounts={active} value={accountId} onChange={setAccountId} />}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change amount" onPress={() => setStep("amount")}>
            {amount !== null ? <Money value={amount} style={{ fontSize: 30, fontWeight: "700", color: colours.text }} /> : <Text style={{ fontSize: 30 }}>—</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={{ backgroundColor: kind === "transfer" ? colours.action : colours.income, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 24 }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>{kind === "transfer" ? "Transfer" : "Save"}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
