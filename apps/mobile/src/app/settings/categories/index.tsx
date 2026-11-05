import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { buildCategoryTree, searchCategories, type CategoryKind, type CategoryNode } from "@ft/core";
import { Button } from "@/components/Button";
import { useSession } from "@/components/providers/SessionProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { Choice, LabeledInput, Muted } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";

/**
 * Categories on Android (R3 US1 on the phone; FR-002 – FR-007, FR-022): the Expense/Income tree from
 * the phone's store, with expand/collapse and search. The one-time start choice needs a connection.
 */
export default function CategoriesScreen() {
  const { categories } = useLists();
  const { me, refreshMe } = useSession();
  const { syncNow } = useSync();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const tree = useMemo(() => buildCategoryTree(categories)[kind], [categories, kind]);
  const matches = useMemo(() => (query.trim() === "" ? null : searchCategories(query, categories, { kind, includeHidden: true })), [query, categories, kind]);
  const started = me?.preferences.categoriesStart != null || categories.length > 0;

  const start = async (choice: "suggested" | "empty") => {
    setBusy(true);
    try {
      await api("/api/categories/start", { body: { choice } });
      await refreshMe();
      await syncNow();
    } catch (err) {
      Alert.alert("Could not start", err instanceof ApiCallError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[]) => {
    for (const n of nodes) {
      rows.push(n);
      if (open.has(n.id)) walk(n.children);
    }
  };
  walk(tree);

  return (
    <Screen title="Categories">
      <SyncStatusBar />
      {!started && (
        <View style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: "#E5E4DD", borderRadius: 8 }}>
          <Text style={{ fontWeight: "600" }}>How would you like to start?</Text>
          <Muted>Start with a suggested list you can change later, or with no categories. This needs a connection.</Muted>
          <Button label="Use the suggested list" onPress={() => void start("suggested")} disabled={busy} />
          <Button label="Start empty" variant="outline" onPress={() => void start("empty")} disabled={busy} />
        </View>
      )}
      <Choice
        label="Kind"
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Button label={`Add ${kind} category`} onPress={() => router.push({ pathname: "/settings/categories/new", params: { kind } })} />
      <LabeledInput label="Search categories" value={query} onChangeText={setQuery} placeholder="Type part of a name" />
      {matches
        ? matches.map((m) => (
            <Pressable
              key={m.category.id}
              accessibilityRole="button"
              onPress={() => router.push(`/settings/categories/${m.category.id}`)}
              style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: "#E5E4DD" }}
            >
              <Text>
                {m.path}
                {m.category.hidden ? " · Hidden" : ""}
              </Text>
            </Pressable>
          ))
        : rows.map((n) => (
            <View key={n.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: n.depth * 20, borderTopWidth: 1, borderColor: "#E5E4DD" }}>
              {n.children.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${open.has(n.id) ? "Collapse" : "Expand"} ${n.name}`}
                  accessibilityState={{ expanded: open.has(n.id) }}
                  onPress={() => toggle(n.id)}
                  hitSlop={8}
                  style={{ width: 24 }}
                >
                  <Text style={{ fontSize: 16 }}>{open.has(n.id) ? "▾" : "▸"}</Text>
                </Pressable>
              ) : (
                <View style={{ width: 24 }} />
              )}
              <Pressable accessibilityRole="button" onPress={() => router.push(`/settings/categories/${n.id}`)} style={{ flex: 1, paddingVertical: 10 }}>
                <Text style={{ color: n.effectiveHidden ? "#5F5E5A" : undefined }}>
                  {n.name}
                  {n.hidden ? " · Hidden" : n.effectiveHidden ? " · Hidden with its parent" : ""}
                </Text>
              </Pressable>
            </View>
          ))}
      {started && tree.length === 0 && !matches && <Text>No {kind} categories yet.</Text>}
    </Screen>
  );
}
