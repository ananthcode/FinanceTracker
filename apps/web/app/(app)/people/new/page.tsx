import Link from "next/link";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPreferences, listCategories, listPayees } from "@ft/db";
import { PayeeForm } from "@/components/lists/PayeeForm";
import { createServerSupabase } from "@/lib/supabase/server";

/** Add person (R3 US3; FR-016, FR-020). */
export default async function NewPersonPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [categories, payees, preferences] = await Promise.all([
    listCategories(supabase),
    listPayees(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  const prefs = preferences ?? DEFAULT_PREFERENCES;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/people" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← People
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Add person
      </h1>
      <PayeeForm
        mode={{ type: "create", kind: "person" }}
        fixedKind="person"
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayInZone(prefs.timezone)}
        payees={payees.map((p) => ({ id: p.id, name: p.name }))}
        returnTo="/people"
      />
    </section>
  );
}
