import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, todayInZone } from "@ft/core";
import { getPayee, getPreferences, listCategories, listPayees } from "@ft/db";
import { PayeeForm } from "@/components/lists/PayeeForm";
import { PayeeManage } from "@/components/lists/PayeeManage";
import { createServerSupabase } from "@/lib/supabase/server";

/** Edit payee (R3 US2; FR-014). */
export default async function EditPayeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [payee, categories, payees, preferences] = await Promise.all([
    getPayee(supabase, id),
    listCategories(supabase),
    listPayees(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  if (!payee) notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/settings/payees" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Payees
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Edit payee
      </h1>
      <PayeeForm
        key={payee.id}
        mode={{ type: "edit", payee }}
        categories={categories}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayInZone(prefs.timezone)}
        payees={payees.filter((p) => p.id !== payee.id).map((p) => ({ id: p.id, name: p.name }))}
        returnTo="/settings/payees"
      />
      <PayeeManage payee={payee} payees={payees} returnTo="/settings/payees" />
    </section>
  );
}
