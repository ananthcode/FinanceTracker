import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { CategoryForm } from "@/components/CategoryForm";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Edit category on Android (R3 US1, US5 on the phone). */
export default function EditCategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { categories, payees } = useLists();
  const category = categories.find((c) => c.id === id) ?? null;
  return (
    <Screen title="Edit category">
      {category ? (
        <CategoryForm key={category.id} category={category} kind={category.kind} parentId={category.parentId} categories={categories} payees={payees} />
      ) : (
        <Text>This category no longer exists.</Text>
      )}
    </Screen>
  );
}
