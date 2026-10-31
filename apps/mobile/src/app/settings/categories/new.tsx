import { useLocalSearchParams } from "expo-router";
import { CategoryForm } from "@/components/CategoryForm";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Add category on Android (R3 US1 on the phone). */
export default function NewCategoryScreen() {
  const { kind, parent } = useLocalSearchParams<{ kind?: string; parent?: string }>();
  const { categories, payees } = useLists();
  return (
    <Screen title="Add category">
      <CategoryForm category={null} kind={kind === "income" ? "income" : "expense"} parentId={parent ?? null} categories={categories} payees={payees} />
    </Screen>
  );
}
