import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import {
  canDeleteCategory,
  canMergeCategory,
  canMoveCategory,
  categoryPath,
  indexCategories,
  mergePreview,
  subtreeIds,
  type CategoryKind,
  type CategoryView,
  type PayeeView,
} from "@ft/core";
import { Button } from "./Button";
import { CategoryPicker } from "./CategoryPicker";
import { useSync } from "./providers/SyncProvider";
import { ErrorText, LabeledInput, Muted } from "./ui";

/** Same starting look as the web form for a new top-level category (components/lists/CategoryForm). */
const NEW_TOP_LEVEL: Record<CategoryKind, { colour: string; icon: string }> = {
  expense: { colour: "green", icon: "shopping-cart" },
  income: { colour: "teal", icon: "coins" },
};

const REASONS = { INVALID_MOVE: "It cannot go there.", NAME_TAKEN: "A category with this name is already there.", INVALID_MERGE: "It cannot merge into that category." };

/**
 * Add or edit a category on Android (R3 US1 on the phone; FR-003 – FR-006, FR-022 – FR-025). Changes
 * go through the sync queue, so they work offline; the server applies the same rules.
 */
export function CategoryForm({
  category,
  kind,
  parentId,
  categories,
  payees,
}: {
  category: CategoryView | null;
  kind: CategoryKind;
  parentId: string | null;
  categories: CategoryView[];
  payees: PayeeView[];
}) {
  const { record } = useSync();
  const [name, setName] = useState(category?.name ?? "");
  const [parent, setParent] = useState<string | null>(category ? category.parentId : parentId);
  const [error, setError] = useState<string | null>(null);
  const index = useMemo(() => indexCategories(categories), [categories]);
  const exclude = useMemo(() => (category ? subtreeIds(categories, category.id) : new Set<string>()), [categories, category]);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed.length > 40) return setError("Enter a name of up to 40 characters.");
    if (!category) {
      const look = parent ? { colour: index.get(parent)!.colour, icon: index.get(parent)!.icon } : NEW_TOP_LEVEL[kind];
      const clash = categories.some((c) => c.kind === kind && c.parentId === parent && c.name.localeCompare(trimmed, "en", { sensitivity: "base" }) === 0);
      if (clash) return setError(REASONS.NAME_TAKEN);
      await record({ entity: "category", entityId: globalThis.crypto.randomUUID(), kind: "create", fields: { name: trimmed, kind, parentId: parent, ...look } });
      return router.back();
    }
    const changed: Record<string, unknown> = {};
    if (trimmed !== category.name) changed.name = trimmed;
    if (parent !== category.parentId) {
      const rule = canMoveCategory(categories.map((c) => (c.id === category.id ? { ...c, name: trimmed } : c)), category.id, parent);
      if (!rule.ok) return setError(REASONS[rule.reason]);
      changed.parentId = parent;
    }
    if (Object.keys(changed).length > 0) await record({ entity: "category", entityId: category.id, kind: "update", fields: changed });
    router.back();
  };

  return (
    <View style={{ gap: 12 }}>
      <LabeledInput label="Name" value={name} onChangeText={setName} maxLength={40} />
      <CategoryPicker label="Inside" categories={categories} value={parent} onChange={setParent} kind={kind} exclude={exclude} noneLabel="Top level" />
      {error && <ErrorText>{error}</ErrorText>}
      <Button label="Save" onPress={() => void save()} />
      {category && <ManageCategory category={category} categories={categories} payees={payees} />}
    </View>
  );
}

function ManageCategory({ category, categories, payees }: { category: CategoryView; categories: CategoryView[]; payees: PayeeView[] }) {
  const { record } = useSync();
  const [target, setTarget] = useState<string | null>(null);
  const index = useMemo(() => indexCategories(categories), [categories]);
  const notMergeable = useMemo(
    () => new Set(categories.filter((c) => !canMergeCategory(categories, category.id, c.id).ok).map((c) => c.id)),
    [categories, category.id],
  );

  const merge = (targetId: string | null) => {
    if (!targetId) return;
    setTarget(targetId);
    const p = mergePreview(categories, payees, category.id, targetId);
    const lines = [
      `Everything in "${category.name}" moves to "${categoryPath(targetId, index)}", and "${category.name}" is removed.`,
      p.moved.length > 0 ? `Sub-categories moved: ${p.moved.join(", ")}.` : "",
      p.merged.length > 0 ? `Merged with same-named ones: ${p.merged.map((m) => m.from).join(", ")}.` : "",
      p.payeeDefaults > 0 ? `${p.payeeDefaults} payee default(s) change.` : "",
    ].filter(Boolean);
    Alert.alert("Merge category?", lines.join("\n\n"), [
      { text: "Cancel", style: "cancel", onPress: () => setTarget(null) },
      {
        text: "Merge",
        style: "destructive",
        onPress: () => void record({ entity: "category", entityId: category.id, kind: "merge", fields: { targetId } }).then(() => router.back()),
      },
    ]);
  };

  const remove = () => {
    const rule = canDeleteCategory(categories, payees, category.id);
    if (!rule.ok) return Alert.alert("Cannot delete", "Move or delete its sub-categories first, or merge it instead.");
    const extra = rule.payeeDefaults > 0 ? ` ${rule.payeeDefaults} payee default(s) will be cleared.` : "";
    Alert.alert("Delete category?", `"${category.name}" will be deleted.${extra}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void record({ entity: "category", entityId: category.id, kind: "delete" }).then(() => router.back()),
      },
    ]);
  };

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      <Button
        label="Add sub-category"
        variant="outline"
        onPress={() => router.push({ pathname: "/settings/categories/new", params: { kind: category.kind, parent: category.id } })}
      />
      <Button
        label={category.hidden ? "Unhide" : "Hide"}
        variant="outline"
        onPress={() => void record({ entity: "category", entityId: category.id, kind: "update", fields: { hidden: !category.hidden } }).then(() => router.back())}
      />
      <Muted>Hidden categories are left out of pickers; existing records keep them.</Muted>
      <CategoryPicker label="Merge into" categories={categories} value={target} onChange={merge} kind={category.kind} exclude={notMergeable} />
      <Button label="Delete" variant="outline" onPress={remove} />
    </View>
  );
}
