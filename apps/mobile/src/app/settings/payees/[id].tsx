import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { PayeeForm } from "@/components/PayeeForm";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Edit payee on Android (R3 US2, US5 on the phone). */
export default function EditPayeeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { payees, categories } = useLists();
  const payee = payees.find((p) => p.id === id) ?? null;
  return (
    <Screen title="Edit payee">
      {payee ? <PayeeForm key={payee.id} payee={payee} payees={payees} categories={categories} /> : <Text>This payee no longer exists.</Text>}
    </Screen>
  );
}
