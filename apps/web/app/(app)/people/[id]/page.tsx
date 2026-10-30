import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, personBalance, todayInZone } from "@ft/core";
import { getPayee, getPreferences, listCategories, listPayees } from "@ft/db";
import { PayeeForm } from "@/components/lists/PayeeForm";
import { PayeeManage } from "@/components/lists/PayeeManage";
import { PersonBalance } from "@/components/lists/PersonBalance";
import { createServerSupabase } from "@/lib/supabase/server";

/** Edit person (R3 US3; FR-016 – FR-020). A business opened here is shown on the payee page instead. */
export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [person, categories, payees, preferences] = await Promise.all([
    getPayee(supabase, id),
    listCategories(supabase),
    listPayees(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  if (!person || person.kind !== "person") notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/people" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← People
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        {person.name}
      </h1>
      <p>
        Balance: <PersonBalance balance={personBalance(person)} className="font-medium" />
      </p>
      <PayeeForm
        key={person.id}
        mode={{ type: "edit", payee: person }}
        fixedKind="person"
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayInZone(prefs.timezone)}
        payees={payees.filter((p) => p.id !== person.id).map((p) => ({ id: p.id, name: p.name }))}
        returnTo="/people"
      />
      <PayeeManage payee={person} payees={payees} returnTo="/people" />
    </section>
  );
}
