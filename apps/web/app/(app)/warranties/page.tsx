import Link from "next/link";
import { DEFAULT_PREFERENCES } from "@ft/core";
import { getPreferences } from "@ft/db";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadWarranties, type WarrantyRow } from "@/lib/warranty-data";

export const metadata = { title: "Warranties" };

function Row({ w, currency }: { w: WarrantyRow; currency: string }) {
  return (
    <li data-warranty={w.id} className="flex flex-col gap-0.5 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Link href={`/transactions/${w.id}?returnTo=${encodeURIComponent("/warranties")}`} className="font-medium text-brand-strong hover:underline dark:text-brand">
          {w.item}
        </Link>
        <span className="font-medium">{w.timeLeft}</span>
        <Money value={BigInt(w.amountMinor)} currency={currency} className="ml-auto tabular-nums" />
      </div>
      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <span>
          Bought <DateText date={w.date} />
        </span>
        <span>
          · Until <DateText date={w.until} />
        </span>
        <span>· {w.receipt ? "Receipt attached" : "No receipt attached"}</span>
        {w.note && <span>· {w.note}</span>}
      </p>
    </li>
  );
}

/**
 * Warranties (R9 US2; FR-009): everything under warranty, soonest to expire first, with the time left in
 * words and whether the receipt is attached; expired ones below.
 */
export default async function WarrantiesPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const prefs = (await getPreferences(supabase, data.user?.id ?? "")) ?? DEFAULT_PREFERENCES;
  const { active, expired } = await loadWarranties(supabase, prefs);
  const currency = prefs.baseCurrency;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <h1 id="page-title" className="text-2xl font-semibold">
        Warranties
      </h1>
      {active.length === 0 && expired.length === 0 ? (
        <p className="max-w-prose text-muted-foreground">
          Nothing is marked under warranty yet. Open a purchase in Transactions and turn on &ldquo;Under warranty&rdquo; with
          the date it ends; attach the receipt there too.
        </p>
      ) : (
        <>
          <section id="warranties-active" aria-labelledby="warranties-active-title" className="flex flex-col gap-1">
            <h2 id="warranties-active-title" className="text-lg font-semibold">
              Under warranty
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">None right now.</p>
            ) : (
              <ul className="divide-y divide-border">
                {active.map((w) => (
                  <Row key={w.id} w={w} currency={currency} />
                ))}
              </ul>
            )}
          </section>
          {expired.length > 0 && (
            <section id="warranties-expired" aria-labelledby="warranties-expired-title" className="flex flex-col gap-1">
              <h2 id="warranties-expired-title" className="text-lg font-semibold">
                Expired
              </h2>
              <ul className="divide-y divide-border">
                {expired.map((w) => (
                  <Row key={w.id} w={w} currency={currency} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Reminders appear on the Dashboard before a warranty ends; choose when in{" "}
        <Link href="/settings#warranty-reminders-settings" className="text-brand-strong underline dark:text-brand">
          Settings
        </Link>
        .
      </p>
    </section>
  );
}
