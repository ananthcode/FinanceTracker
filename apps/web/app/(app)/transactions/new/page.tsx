import Link from "next/link";
import { DEFAULT_PREFERENCES, parseMonthParam, payDraft, todayInZone, type PayDraft } from "@ft/core";
import { getPreferences, listAccounts, listCategories, listPayees, listTags } from "@ft/db";
import { TransactionForm, type PlanLinkProp } from "@/components/transactions/TransactionForm";
import { loadPlan } from "@/lib/plan-data";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeReturn } from "@/lib/transactions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// "interest" is recorded by hand from a person's page (FR-015).
const TYPES = ["expense", "income", "refund", "transfer", "person", "interest"] as const;

/**
 * Add a transaction (R4 US1–US3, US5). `?type=`, `?account=` and `?payee=` preselect; `?returnTo=` comes
 * back. `?plan=<item>&month=yyyy-MM` is Pay from the payment plan (R7 FR-010): the form opens filled in
 * from the planned payment, and saving links the transaction to that month's item.
 */
export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const [accounts, payees, categories, tags, preferences] = await Promise.all([
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    getPreferences(supabase, data.user?.id ?? ""),
  ]);
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(prefs.timezone);
  const returnTo = safeReturn(params.returnTo, "/transactions");
  const type = TYPES.find((t) => t === params.type);
  const accountId = typeof params.account === "string" && UUID.test(params.account) ? params.account : null;
  const payeeId = typeof params.payee === "string" && UUID.test(params.payee) ? params.payee : null;

  // Pay: the item-month must be one of the caller's own (RLS) live items and a month it has.
  let draft: PayDraft | undefined;
  let planLink: PlanLinkProp | null = null;
  const planMonth = typeof params.month === "string" ? parseMonthParam(params.month) : null;
  if (typeof params.plan === "string" && UUID.test(params.plan) && planMonth) {
    const plan = await loadPlan(supabase, prefs, [planMonth]);
    const item = plan.items.find((i) => i.id === params.plan && i.state === "active");
    const row = plan.views.get(planMonth)?.rows.find((r) => r.itemId === params.plan);
    if (item && row && row.status !== "skipped") {
      draft = payDraft(row, item, todayIso, {
        accounts: new Set(accounts.filter((a) => a.state === "active").map((a) => a.id)),
        payees: new Set(payees.map((p) => p.id)),
        categories: new Set(categories.map((c) => c.id)),
      });
      planLink = { itemId: item.id, month: planMonth, name: item.name, fixed: true };
    }
  }

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      <Link href={returnTo} className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← Back
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        {planLink ? `Pay ${planLink.name}` : "Add transaction"}
      </h1>
      <TransactionForm
        mode={{ type: "create", kind: type, accountId, payeeId, draft }}
        planLink={planLink}
        accounts={accounts}
        payees={payees}
        categories={categories}
        tags={tags}
        categoriesStart={prefs.categoriesStart}
        todayIso={todayIso}
        currency={prefs.baseCurrency}
        returnTo={returnTo}
      />
    </section>
  );
}
