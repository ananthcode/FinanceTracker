import Link from "next/link";
import { DEFAULT_PREFERENCES, orderedTemplates, TEMPLATE_LIMIT } from "@ft/core";
import { getPreferences, listTemplates } from "@ft/db";
import { ManageTemplates } from "@/components/templates/ManageTemplates";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

/** Manage templates (R8 US2; FR-001, FR-004): order, hide, show, edit, make a new one. */
export default async function TemplatesPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const templates = orderedTemplates(await listTemplates(supabase));
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href="/transactions#quick-add" className="text-sm text-brand-strong underline dark:text-brand">
        Back to Transactions
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="page-title" className="text-2xl font-semibold">
          Manage templates
        </h1>
        {templates.length < TEMPLATE_LIMIT && (
          <Link href="/templates/new" className={buttonVariants()}>
            Make a template
          </Link>
        )}
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Templates appear in this order in Quick add on Transactions and the Dashboard. Hidden ones stay here but leave the list.
        You can also make one from any transaction with &ldquo;Save as template&rdquo;.
      </p>
      <ManageTemplates templates={templates} currency={prefs.baseCurrency} />
    </section>
  );
}
