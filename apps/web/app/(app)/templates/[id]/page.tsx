import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, orderedTemplates, todayInZone } from "@ft/core";
import { getPreferences, getTemplate, listAccounts, listCategories, listPayees, listTags, listTemplates, planItems } from "@ft/db";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Edit or delete a template (R8 US2 4, 5; FR-006: recordings already made do not change). */
export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const [template, accounts, payees, categories, tags, templates, items] = await Promise.all([
    getTemplate(supabase, id),
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    listTemplates(supabase),
    planItems(supabase),
  ]);
  if (!template) notFound();
  const takenNames = orderedTemplates(templates)
    .filter((t) => t.id !== id)
    .map((t) => t.name);
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/templates" className="text-sm text-brand-strong underline dark:text-brand">
        Back to Manage templates
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Edit template {template.name}
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">Changes apply to the next recordings. Transactions already recorded stay as they are.</p>
      <TransactionForm
        key={template.id}
        mode={{ type: "template", template, sortKey: template.sortKey, takenNames, planItems: items }}
        accounts={accounts}
        payees={payees}
        categories={categories}
        tags={tags}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayInZone(prefs.timezone)}
        currency={prefs.baseCurrency}
        returnTo="/templates"
      />
    </section>
  );
}
