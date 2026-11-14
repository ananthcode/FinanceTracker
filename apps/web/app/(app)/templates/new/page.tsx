import Link from "next/link";
import { DEFAULT_PREFERENCES, keyBetween, orderedTemplates, templateFromTransaction, todayInZone } from "@ft/core";
import { getPreferences, getTransaction, listAccounts, listCategories, listPayees, listTags, listTemplates, planItems } from "@ft/db";
import { TransactionForm, type FormDraft } from "@/components/transactions/TransactionForm";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Make a template (R8 US2 1, 2; FR-001 – FR-003). `?from=<transaction>` is "Save as template": the form
 * starts from that transaction's details (no date, status, reference or plan link) and a free name.
 * New templates go to the end of the list.
 */
export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const [accounts, payees, categories, tags, templates, items, source] = await Promise.all([
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    listTemplates(supabase),
    planItems(supabase),
    from && UUID.test(from) ? getTransaction(supabase, from) : Promise.resolve(null),
  ]);
  const ordered = orderedTemplates(templates);
  const takenNames = ordered.map((t) => t.name);
  const today = todayInZone(prefs.timezone);
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));
  const base = source ? templateFromTransaction(source, takenNames, { payee: (id) => payeeName.get(id) ?? null }) : null;
  const seed: FormDraft | null = base ? { ...base, date: today, notes: base.notes ?? "" } : null;
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/templates" className="text-sm text-brand-strong underline dark:text-brand">
        Back to Manage templates
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        {source ? "Save as template" : "Make a template"}
      </h1>
      <TransactionForm
        mode={{ type: "template", template: null, seed, seedName: base?.name, sortKey: keyBetween(ordered.at(-1)?.sortKey ?? null, null), takenNames, planItems: items }}
        accounts={accounts}
        payees={payees}
        categories={categories}
        tags={tags}
        categoriesStart={prefs.categoriesStart}
        todayIso={today}
        currency={prefs.baseCurrency}
        returnTo="/templates"
      />
    </section>
  );
}
