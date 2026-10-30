import Link from "next/link";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPreferences, listCategories, listPayees } from "@ft/db";
import { PayeeForm } from "@/components/lists/PayeeForm";
import { createServerSupabase } from "@/lib/supabase/server";

/** Add payee (R3 US2, FR-012). `?kind=person` starts with a person. */
export default async function NewPayeePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
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
      <Link href="/settings/payees" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Payees
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Add payee
      </h1>
      <PayeeForm
        mode={{ type: "create", kind: kind === "person" ? "person" : "business" }}
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayInZone(prefs.timezone)}
        payees={payees.map((p) => ({ id: p.id, name: p.name }))}
        returnTo="/settings/payees"
      />
    </section>
  );
}
