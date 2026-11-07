import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PREFERENCES, financialYearPeriod, personStatement, todayInZone, type Period, type TransactionView } from "@ft/core";
import { getPayee, getPreferences, getProfile, listPayees, searchTransactions, type TransactionCursor } from "@ft/db";
import { StatementDownload } from "@/components/statements/StatementDownload";
import { StatementSignSetting } from "@/components/statements/StatementSignSetting";
import { StatementView } from "@/components/statements/StatementView";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabase } from "@/lib/supabase/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A person's statement for any date range (R6 US4; FR-009 – FR-013): shown here, downloaded as a PNG
 * or a PDF. Reads through the user's own client — row-level security returns only their rows.
 */
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? "";
  const [person, payees, preferences, profile] = await Promise.all([getPayee(supabase, id), listPayees(supabase), getPreferences(supabase, userId), getProfile(supabase, userId)]);
  if (!person || person.kind !== "person") notFound();
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const todayIso = todayInZone(prefs.timezone);

  // This financial year so far, until the user chooses other dates.
  const fallback: Period = { from: financialYearPeriod(todayIso, prefs.fyStartMonth).from, to: todayIso };
  const asked = { from: query.from, to: query.to };
  const wellFormed = typeof asked.from === "string" && typeof asked.to === "string" && ISO.test(asked.from) && ISO.test(asked.to);
  const reversed = wellFormed && asked.from! > asked.to!;
  const range: Period = wellFormed && !reversed ? { from: asked.from as string, to: asked.to as string } : fallback;

  // Every page up to the range's end: the opening balance needs the movements before the range.
  const transactions: TransactionView[] = [];
  let after: TransactionCursor | null = null;
  do {
    const page = await searchTransactions(supabase, { payeeId: person.id, to: range.to }, after, 200);
    transactions.push(...page.rows);
    after = page.next;
  } while (after);

  // A split share may name its business; another person is never named (US4 3).
  const businesses = new Map(payees.filter((p) => p.kind === "business").map((p) => [p.id, p.name]));
  const statement = personStatement(person, transactions, range, (payeeId) => businesses.get(payeeId) ?? "");
  const returnTo = `/people/${person.id}/statement?from=${range.from}&to=${range.to}`;

  return (
    <section aria-labelledby="page-title" className="flex max-w-3xl flex-col gap-4">
      <Link href={`/people/${person.id}`} className="text-sm text-brand-strong hover:underline dark:text-brand">
        ← {person.name}
      </Link>
      <h1 id="page-title" className="text-2xl font-semibold">
        Statement for {person.name}
      </h1>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="statement-from">From</Label>
          <Input id="statement-from" name="from" type="date" required defaultValue={range.from} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="statement-to">To</Label>
          <Input id="statement-to" name="to" type="date" required defaultValue={range.to} />
        </div>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Show
        </button>
      </form>
      {reversed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          The start date is after the end date, so this financial year is shown instead.
        </p>
      )}

      <StatementSignSetting personId={person.id} sign={person.statementSign} />
      <StatementView statement={statement} personName={person.name} returnTo={returnTo} />
      <StatementDownload statement={statement} personName={person.name} displayName={profile?.displayName ?? ""} />
    </section>
  );
}
