import Link from "next/link";
import { getPreferences, listCategories, listPayees } from "@ft/db";
import { CategoriesScreen } from "@/components/lists/CategoriesScreen";
import { createServerSupabase } from "@/lib/supabase/server";

/** Settings › Categories (R3 US1, US5; FR-001 – FR-008, FR-022 – FR-025). */
export default async function CategoriesPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const [categories, payees, preferences] = await Promise.all([
    listCategories(supabase),
    listPayees(supabase),
    getPreferences(supabase, auth.user?.id ?? ""),
  ]);

  return (
    <section aria-labelledby="page-title" className="flex max-w-2xl flex-col gap-4">
      <Link href="/settings" className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Settings
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Categories
      </h1>
      <p className="text-muted-foreground">
        Categories sort your spending and income. Sub-categories add up into their parents in reports.
      </p>
      <CategoriesScreen categories={categories} categoriesStart={preferences?.categoriesStart ?? null} payees={payees} />
    </section>
  );
}
