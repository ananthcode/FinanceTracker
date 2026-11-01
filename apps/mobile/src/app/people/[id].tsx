import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { PayeeForm } from "@/components/PayeeForm";
import { PersonInterest } from "@/components/PersonInterest";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Edit person on Android (R3 US3, US5; R4 US4 interest on the phone). */
export default function EditPersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { payees, categories } = useLists();
  const person = payees.find((p) => p.id === id && p.kind === "person") ?? null;
  return (
    <Screen title={person?.name ?? "Person"}>
      {person ? (
        <>
          <PayeeForm key={person.id} payee={person} payees={payees} categories={categories} fixedKind="person" />
          <PersonInterest person={person} />
        </>
      ) : (
        <Text>This person no longer exists.</Text>
      )}
    </Screen>
  );
}
