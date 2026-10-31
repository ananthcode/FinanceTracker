import { PayeeForm } from "@/components/PayeeForm";
import { useLists } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";

/** Add payee on Android (R3 US2 on the phone). */
export default function NewPayeeScreen() {
  const { payees, categories } = useLists();
  return (
    <Screen title="Add payee">
      <PayeeForm payee={null} payees={payees} categories={categories} />
    </Screen>
  );
}
