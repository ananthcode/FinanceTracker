import Link from "next/link";
import {
  ACCOUNT_COLOURS,
  categoryShareOf,
  categoryTree,
  DEFAULT_PREFERENCES,
  monthlyTrend,
  NO_PAYEE_ID,
  PERIOD_PRESETS,
  periodOf,
  todayInZone,
  transactionLabel,
  UNCATEGORISED_ID,
  type AccountColour,
  type Period,
  type PeriodPreset,
  type ReportNode,
} from "@ft/core";
import { categoryPayeeTotals, getPreferences, listAccounts, listCategories, listPayees, monthTotals, searchTransactions } from "@ft/db";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { BarList, type Bar } from "@/components/reports/BarList";
import { Breadcrumb, type Crumb } from "@/components/reports/Breadcrumb";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { TrendChart } from "@/components/reports/TrendChart";
import { createServerSupabase } from "@/lib/supabase/server";

type View = "spending" | "income" | "trend";
const VIEWS: { id: View; label: string }[] = [
  { id: "spending", label: "Spending" },
  { id: "income", label: "Income" },
  { id: "trend", label: "Trend" },
];
const TREND_PRESETS: PeriodPreset[] = ["last_12_months", "this_fy", "custom"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 3660; // as app._report_range allows

interface State {
  view: View;
  preset: PeriodPreset;
  period: Period;
  cat?: string;
  own?: boolean;
  payee?: string;
}

/** The report URL for a state; the period always travels with it (US2 5). */
function hrefOf(s: State): string {
  const q = new URLSearchParams({ view: s.view, period: s.preset });
  if (s.preset === "custom") {
    q.set("from", s.period.from);
    q.set("to", s.period.to);
  }
  if (s.cat) q.set("cat", s.cat);
  if (s.own) q.set("own", "1");
  if (s.payee) q.set("payee", s.payee);
  return `/reports?${q.toString()}`;
}

function validRange(from: string | undefined, to: string | undefined): Period | undefined {
  if (!from || !to || !ISO.test(from) || !ISO.test(to) || from > to) return undefined;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days <= MAX_DAYS ? { from, to } : undefined;
}

/**
 * Reports (R6 US2, US3; FR-005 – FR-008): spending or income by category, drilling category →
 * sub-category → payee → transactions, and income vs spending per month. Every level comes from one
 * set of totals (app.category_payee_totals), so each adds up exactly to the one above (SC-002); the
 * transactions at the end are the same R4 records, each with its share in the category.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" && params[key] !== "" ? (params[key] as string) : undefined);

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(prefs.timezone);
  const currency = prefs.baseCurrency;

  const view: View = VIEWS.some((v) => v.id === one("view")) ? (one("view") as View) : "spending";
  const presets = view === "trend" ? TREND_PRESETS : [...PERIOD_PRESETS];
  const asked = one("period") as PeriodPreset | undefined;
  const custom = validRange(one("from"), one("to"));
  let preset: PeriodPreset = asked && presets.includes(asked) ? asked : view === "trend" ? "last_12_months" : "this_month";
  if (preset === "custom" && !custom) preset = view === "trend" ? "last_12_months" : "this_month";
  const period = periodOf(preset, todayIso, prefs.fyStartMonth, custom);
  const base: State = { view, preset, period };

  const header = (
    <>
      <h1 id="page-title" className="text-2xl font-semibold">
        Reports
      </h1>
      <nav aria-label="Report" className="flex gap-1 border-b border-border">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={hrefOf({ view: v.id, preset: v.id !== "trend" || TREND_PRESETS.includes(preset) ? preset : "last_12_months", period })}
            aria-current={v.id === view ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${v.id === view ? "border-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <PeriodPicker key={`${view}-${preset}-${period.from}-${period.to}`} preset={preset} from={period.from} to={period.to} presets={presets} />
      <p className="text-sm text-muted-foreground">
        <DateText date={period.from} /> to <DateText date={period.to} />
      </p>
    </>
  );

  if (view === "trend") {
    const months = monthlyTrend(await monthTotals(supabase, period), period);
    return (
      <section aria-labelledby="page-title" className="flex flex-col gap-4">
        {header}
        <h2 className="text-lg font-medium">Income and spending per month</h2>
        <TrendChart months={months} />
      </section>
    );
  }

  const kind = view === "income" ? "income" : "expense";
  const words = view === "income" ? "income" : "spending";
  const [rows, categories, payees] = await Promise.all([categoryPayeeTotals(supabase, period), listCategories(supabase), listPayees(supabase)]);
  const tree = categoryTree(rows, kind, categories);
  const colourOf = new Map(categories.map((c) => [c.id, (ACCOUNT_COLOURS[c.colour as AccountColour] ?? ACCOUNT_COLOURS.slate).light]));
  const payeeName = (id: string) => (id === NO_PAYEE_ID ? "No payee" : (payees.find((p) => p.id === id)?.name ?? "Deleted payee"));

  const node: ReportNode | undefined = one("cat") ? tree.byId.get(one("cat")!) : undefined;
  const payee = node && one("payee") && node.payees.some((p) => p.id === one("payee")) ? one("payee")! : undefined;
  // A category with sub-categories lists them; its own amount is one more entry that opens its payees.
  const atPayees = node && (node.children.length === 0 || one("own") === "1");

  const crumbs: Crumb[] = [{ label: view === "income" ? "All income" : "All spending", href: hrefOf(base) }];
  if (node) {
    const chain: ReportNode[] = [];
    for (let n: ReportNode | undefined = node; n; ) {
      chain.unshift(n);
      const parent = categories.find((c) => c.id === n!.id)?.parentId;
      n = parent ? tree.byId.get(parent) : undefined;
    }
    for (const n of chain) crumbs.push({ label: n.name, href: hrefOf({ ...base, cat: n.id }) });
    if (node.children.length > 0 && atPayees) crumbs.push({ label: `${node.name} itself`, href: hrefOf({ ...base, cat: node.id, own: true }) });
    if (payee) crumbs.push({ label: payeeName(payee), href: hrefOf({ ...base, cat: node.id, own: one("own") === "1", payee }) });
  }

  let body: React.ReactNode;
  if (tree.nodes.length === 0) {
    body = <p className="text-muted-foreground">No {words} recorded in this period.</p>;
  } else if (node && payee) {
    const page = await searchTransactions(
      supabase,
      { from: period.from, to: period.to, categoryId: node.id, categoryExact: true, payeeId: payee },
      null,
      200,
    );
    const accounts = await listAccounts(supabase);
    const categoryId = node.id === UNCATEGORISED_ID ? null : node.id;
    const listed = page.rows.map((tx) => ({ tx, share: categoryShareOf(tx, kind, categoryId) })).filter((r) => r.share !== 0n);
    const total = listed.reduce((s, r) => s + r.share, 0n);
    const returnTo = hrefOf({ ...base, cat: node.id, own: one("own") === "1", payee });
    body = (
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">
          {payeeName(payee)} in {node.name}
        </h2>
        <ul aria-label="Transactions" className="divide-y divide-border">
          {listed.map(({ tx, share }) => (
            <li key={tx.id} className="flex items-baseline gap-3 py-2">
              <span className="flex flex-col">
                <Link href={`/transactions/${tx.id}?returnTo=${encodeURIComponent(returnTo)}`} className="font-medium text-brand-strong hover:underline dark:text-brand">
                  {transactionLabel(tx, {
                    account: (id) => accounts.find((a) => a.id === id)?.name ?? "an account",
                    payee: (id) => payees.find((p) => p.id === id)?.name ?? "",
                  })}
                </Link>
                <span className="text-sm text-muted-foreground">
                  <DateText date={tx.date} />
                  {tx.lines.length > 0 && " · part of a split"}
                </span>
              </span>
              <span className="ml-auto tabular-nums">
                <Money value={share < 0n ? -share : share} currency={currency} />
                {share < 0n && " refunded"}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex border-t border-border pt-2 font-medium">
          Total
          <span id="report-transactions-total" className="ml-auto tabular-nums">
            <Money value={total < 0n ? -total : total} currency={currency} />
          </span>
        </p>
        {page.count > page.rows.length && <p className="text-sm text-muted-foreground">Showing the first {page.rows.length} transactions.</p>}
      </div>
    );
  } else {
    let bars: Bar[];
    let title: string;
    if (node && atPayees) {
      title = `${node.name} by payee`;
      bars = node.payees.map((p) => ({
        key: p.id,
        label: payeeName(p.id),
        amountMinor: p.totalMinor,
        href: hrefOf({ ...base, cat: node.id, own: one("own") === "1", payee: p.id }),
      }));
    } else if (node) {
      title = `${node.name} by sub-category`;
      bars = node.children.map((c) => ({ key: c.id, label: c.name, amountMinor: c.totalMinor, href: hrefOf({ ...base, cat: c.id }), colour: colourOf.get(c.id) }));
      if (node.ownMinor !== 0n)
        bars.push({ key: `${node.id}-own`, label: `${node.name} itself`, amountMinor: node.ownMinor, href: hrefOf({ ...base, cat: node.id, own: true }), colour: colourOf.get(node.id) });
    } else {
      title = `${view === "income" ? "Income" : "Spending"} by category`;
      bars = tree.nodes.map((n) => ({ key: n.id, label: n.name, amountMinor: n.totalMinor, href: hrefOf({ ...base, cat: n.id }), colour: colourOf.get(n.id) }));
    }
    const levelTotal = node ? (atPayees ? node.ownMinor : node.totalMinor) : tree.totalMinor;
    body = (
      <div className="flex flex-col gap-3">
        <h2 className="flex items-baseline gap-2 text-lg font-medium">
          {title}
          <span id="report-level-total" className="ml-auto tabular-nums">
            <Money value={levelTotal < 0n ? -levelTotal : levelTotal} currency={currency} />
          </span>
        </h2>
        <BarList title={title} bars={bars} totalMinor={levelTotal} negativeWords="refunded" />
      </div>
    );
  }

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-4">
      {header}
      <Breadcrumb crumbs={crumbs} />
      {body}
    </section>
  );
}
