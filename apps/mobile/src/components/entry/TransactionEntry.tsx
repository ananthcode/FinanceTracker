import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryPath, currentBalance, formatAmountInput, indexCategories, PERSON_ACTION_TEXT, personBalanceOf, todayInZone, type MovementTotals, type PersonAction, type TransactionView } from "@ft/core";
import { BalanceWords } from "@/components/PayeeForm";
import { Money } from "@/components/Money";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { useLists, useMoney } from "@/components/providers/useLists";
import { useSync } from "@/components/providers/SyncProvider";
import { evaluateAmount } from "@/lib/calc";
import { colours } from "@/lib/theme";
import { AccountChips, AmountPad, CategoryChips } from "./parts";
import { newId } from "@/lib/ids";

export type EntryKind = "expense" | "income" | "transfer" | "refund" | "person";

/** The person movements the phone records; adjustments and interest stay on the web. */
const PERSON_ACTIONS: { action: PersonAction; hint: string }[] = [
  { action: "lent", hint: "money out" },
  { action: "repaid_to", hint: "money out" },
  { action: "borrowed", hint: "money in" },
  { action: "received_back", hint: "money in" },
];
const moneyIn = (a: PersonAction) => a === "borrowed" || a === "received_back" || a === "collected_on_behalf";
type Step = "amount" | "category" | "review";

const TONE: Record<EntryKind, string> = { expense: colours.expense, income: colours.income, transfer: colours.action, refund: colours.incomeInk, person: "#993556" };
const TITLE: Record<EntryKind, string> = { expense: "Expense", income: "Income", transfer: "Transfer", refund: "Refund", person: "Person" };

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
  const { accounts, transactions, movements, personTotals } = useMoney();
  const today = todayInZone(preferences.timezone);
  const seed = existing ?? prefill;
  // Most-used accounts first, so the usual one is visible without swiping; the chosen one leads.
  const usage = new Map<string, number>();
  for (const t of transactions.slice(-300)) for (const id of [t.accountId, t.toAccountId]) if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
  const byUse = accounts.filter((a) => a.state === "active").sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0));
  const active = byUse;
  const lead = (id: string | null) => (id ? [...byUse.filter((a) => a.id === id), ...byUse.filter((a) => a.id !== id)] : byUse);

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
  const [personAction, setPersonAction] = useState<PersonAction>(seed?.personAction ?? "lent");
  const people = payees.filter((p) => p.kind === "person" && (!p.hidden || p.id === payeeId));
  const direct = kind === "transfer" || kind === "person";
  const [tagIds, setTagIds] = useState<string[]>(seed?.tagIds ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [date, setDate] = useState(existing?.date ?? today);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const intoAccount = kind === "income" || kind === "refund" || (kind === "person" && moneyIn(personAction));
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
    if (kind === "person" && !people.some((p) => p.id === payeeId)) return Alert.alert("Choose the person");
    setBusy(true);
    try {
      let payee = payeeId;
      const typed = payeeText.trim();
      if (!direct && !payee && typed !== "") {
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
        categoryId: direct ? null : categoryId,
        personAction: kind === "person" ? personAction : null,
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
          personAction: existing.personAction,
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
      <Pressable accessibilityRole="button" accessibilityLabel={step === "amount" || existing ? "Close" : "Back"} hitSlop={10} onPress={() => (step === "amount" || existing ? close() : setStep(step === "review" && !direct ? "category" : "amount"))}>
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
          <AccountChips label={kind === "transfer" ? "From" : intoAccount ? "Into" : "Pay from"} accounts={lead(accountId)} value={accountId} onChange={setAccountId} balances={balances} />
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
            onPress={() => (amount !== null && amount > 0n ? setStep(direct ? "review" : "category") : Alert.alert("Enter an amount"))}
            style={{ backgroundColor: colours.income, borderRadius: 16, paddingVertical: 14, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>{kind === "transfer" ? "Next: accounts" : kind === "person" ? "Next: person" : "Next: category"}</Text>
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
        {kind === "person" && <PersonPicker totals={personTotals} people={people} payeeId={payeeId} onPerson={setPayeeId} action={personAction} onAction={setPersonAction} />}
        {!direct && (
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
            <AccountChips label="From" accounts={lead(accountId)} value={accountId} onChange={setAccountId} balances={balances} tone={colours.expense} />
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
            <AccountChips label="To" accounts={lead(toAccountId).filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} balances={balances} tone={colours.income} />
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
        {kind !== "transfer" && <AccountChips label={intoAccount ? "Into" : "Pay with"} accounts={lead(accountId)} value={accountId} onChange={setAccountId} />}
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

/** Who and what happened, for a person movement (R4 FR-011): money lent, repaid, borrowed or received back. */
function PersonPicker({
  totals,
  people,
  payeeId,
  onPerson,
  action,
  onAction,
}: {
  totals: MovementTotals;
  people: ReturnType<typeof useLists>["payees"];
  payeeId: string | null;
  onPerson: (id: string) => void;
  action: PersonAction;
  onAction: (a: PersonAction) => void;
}) {
  const chosen = people.find((p) => p.id === payeeId);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colours.muted, fontSize: 13 }}>What happened</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="What happened">
          {PERSON_ACTIONS.map(({ action: a, hint }) => {
            const on = a === action;
            return (
              <Pressable key={a} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onAction(a)} style={{ width: "48%", padding: 10, borderRadius: 14, backgroundColor: on ? "#FBEAF0" : colours.card, borderWidth: on ? 2 : 1, borderColor: on ? "#993556" : colours.line }}>
                <Text style={{ fontWeight: "600", color: on ? "#72243E" : colours.text }}>{PERSON_ACTION_TEXT[a]}…</Text>
                <Text style={{ fontSize: 12, color: colours.muted }}>{hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colours.muted, fontSize: 13 }}>Person</Text>
        {people.length === 0 && <Text style={{ color: colours.muted }}>No people yet. Add one from the menu → People.</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Person">
          {people.map((p) => {
            const on = p.id === payeeId;
            return (
              <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onPerson(p.id)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? "#993556" : colours.card, borderWidth: on ? 0 : 1, borderColor: colours.line }}>
                <Text style={{ color: on ? "#FFFFFF" : colours.text, fontWeight: "600" }}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {chosen && (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Text style={{ color: colours.muted, fontSize: 12 }}>Now:</Text>
            <BalanceWords balance={personBalanceOf(chosen, totals)} />
          </View>
        )}
      </View>
    </View>
  );
}
