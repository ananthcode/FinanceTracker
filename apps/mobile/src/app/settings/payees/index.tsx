import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { categoryPath, compareNames, indexCategories, personBalanceOf } from "@ft/core";
import { Button } from "@/components/Button";
import { BalanceWords } from "@/components/PayeeForm";
import { useLists, useMoney } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { Choice, LabeledInput, Muted } from "@/components/ui";

type KindFilter = "all" | "business" | "person";
const PAGE = 200;

/** Payees on Android (R3 US2 on the phone; FR-013): search, kind filter, hidden toggle. */
export default function PayeesScreen() {
  const { payees, categories } = useLists();
  const { personTotals } = useMoney();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const index = useMemo(() => indexCategories(categories), [categories]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payees
      .filter((p) => (kind === "all" || p.kind === kind) && (showHidden || !p.hidden) && (q === "" || p.name.toLowerCase().includes(q)))
      .sort((a, b) => compareNames(a.name, b.name));
  }, [payees, query, kind, showHidden]);

  return (
    <Screen title="Payees">
      <SyncStatusBar />
      <Button label="Add payee" onPress={() => router.push("/settings/payees/new")} />
      <LabeledInput label="Search payees" value={query} onChangeText={setQuery} placeholder="Type part of a name" />
      <Choice
        label="Show"
        options={[
          { value: "all", label: "All" },
          { value: "business", label: "Businesses" },
          { value: "person", label: "People" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Switch accessibilityLabel="Show hidden" value={showHidden} onValueChange={setShowHidden} />
        <Text>Show hidden</Text>
      </View>
      <Muted>{shown.length === 1 ? "1 payee" : `${shown.length} payees`}</Muted>
      {shown.slice(0, limit).map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => router.push(p.kind === "person" ? `/people/${p.id}` : `/settings/payees/${p.id}`)}
          style={{ gap: 2, paddingVertical: 10, borderTopWidth: 1, borderColor: "#E5E4DD" }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontWeight: "600", flex: 1 }}>
              {p.name}
              {p.hidden ? " · Hidden" : ""}
            </Text>
            {p.kind === "person" ? <BalanceWords balance={personBalanceOf(p, personTotals)} /> : <Text style={{ color: "#5F5E5A" }}>Business</Text>}
          </View>
          {p.defaultCategoryId && <Muted>Default: {categoryPath(p.defaultCategoryId, index) || "—"}</Muted>}
        </Pressable>
      ))}
      {shown.length > limit && <Button label={`Show ${Math.min(PAGE, shown.length - limit)} more`} variant="outline" onPress={() => setLimit((n) => n + PAGE)} />}
    </Screen>
  );
}
