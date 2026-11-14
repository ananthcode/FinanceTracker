import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tieMessage, tiedPlanMonth, templateProblems, todayInZone, visibleTemplates, type Preferences, type TemplateView } from "@ft/core";
import { listAccounts, listCategories, listPayees, listTags, listTemplates } from "@ft/db";
import type { QuickAddInfo } from "@/components/templates/QuickAdd";
import { loadPlan } from "./plan-data";

/**
 * What the quick-add list needs (R8): the visible templates in order, today in the user's timezone, and
 * for each template what it would pay in the plan now (R8-04) and whether anything it refers to has gone
 * (R8-05). Read with the user's own client (RLS).
 */
export async function loadQuickAdd(supabase: SupabaseClient, prefs: Preferences): Promise<{ templates: TemplateView[]; info: Record<string, QuickAddInfo>; today: string }> {
  const today = todayInZone(prefs.timezone);
  const all = await listTemplates(supabase);
  const templates = visibleTemplates(all);
  if (templates.length === 0) return { templates, info: {}, today };
  const tied = templates.some((t) => t.planItemId !== null);
  const [accounts, payees, categories, tags, plan] = await Promise.all([
    listAccounts(supabase),
    listPayees(supabase),
    listCategories(supabase),
    listTags(supabase),
    tied ? loadPlan(supabase, prefs, "current") : Promise.resolve(null),
  ]);
  const live = {
    accounts: new Set(accounts.filter((a) => a.state === "active").map((a) => a.id)),
    payees: new Set(payees.map((p) => p.id)),
    categories: new Set(categories.map((c) => c.id)),
    tags: new Set(tags.map((t) => t.id)),
  };
  const items = new Map((plan?.items ?? []).map((i) => [i.id, i]));
  const view = plan?.views.get(plan.currentMonth);
  const info: Record<string, QuickAddInfo> = {};
  for (const t of templates) {
    const outcome = view ? tiedPlanMonth(t, t.planItemId ? items.get(t.planItemId) : undefined, view) : null;
    info[t.id] = {
      pays: outcome?.pays ? { itemId: outcome.pays.itemId, month: outcome.pays.month, name: outcome.pays.name } : null,
      tie: outcome && plan ? tieMessage(outcome, plan.currentMonth) : null,
      incomplete: templateProblems(t, live).length > 0,
    };
  }
  return { templates, info, today };
}
