import { PayeeForm } from "@/components/PayeeForm";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Add person on Android (R3 US3 on the phone). */
export default function NewPersonScreen() {
  const { payees, categories } = useLists();
  return (
    <Screen title="Add person">
      <PayeeForm payee={null} payees={payees} categories={categories} fixedKind="person" />
    </Screen>
  );
}
