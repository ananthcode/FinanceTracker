"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DATE_FORMATS, fiscalYearOf, formatAmountInput, parseAmountInput, WARRANTY_FIRST_CHOICES, WARRANTY_SECOND_CHOICES, type Preferences } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Money } from "@/components/Money";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { DisplayProvider } from "@/components/providers/DisplayProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SAMPLE_AMOUNT = 123456700n; // ₹12,34,567.00 in paise

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

function timezones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("Asia/Kolkata") ? zones : ["Asia/Kolkata", ...zones];
}

/**
 * Shared first-run setup / settings form (FR-020–FR-024). The live preview renders a sample amount
 * and date through the app's Money/DateText components using the values currently in the form.
 */
export function PreferencesForm({
  mode,
  initial,
  initialDisplayName,
  needsPrivacyNotice = false,
  nowIso,
}: {
  mode: "setup" | "settings";
  initial: Preferences;
  initialDisplayName: string;
  needsPrivacyNotice?: boolean;
  nowIso: string;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  // R6 FR-003: the safe-to-spend buffer, typed as an amount and stored in paise.
  const [buffer, setBuffer] = useState(formatAmountInput(BigInt(initial.bufferMinor), initial.baseCurrency));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const zones = useMemo(() => timezones(), []);
  const fy = fiscalYearOf(nowIso.slice(0, 10), prefs.fyStartMonth);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setStatus(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const isSetup = mode === "setup";
    // categoriesStart is set only by the start choice (R3 FR-007); the preferences endpoint refuses it.
    // The checked month is set only by "Plan checked" (R7 FR-023), never by this form.
    const { baseCurrency, categoriesStart, planCheckedMonth, ...editable } = prefs;
    void categoriesStart;
    void planCheckedMonth;
    if (!isSetup) {
      const parsed = buffer.trim() === "" ? ({ ok: true, minor: 0n } as const) : parseAmountInput(buffer, { currency: baseCurrency });
      if (!parsed.ok || parsed.minor < 0n) {
        setBusy(false);
        setStatus({ ok: false, message: "Enter the safe-to-spend buffer as an amount like 5,000.00." });
        return;
      }
      editable.bufferMinor = parsed.minor.toString();
    }
    try {
      const res = await fetch(isSetup ? "/api/me/setup" : "/api/me/preferences", {
        method: isSetup ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isSetup
            ? { displayName, baseCurrency, ...editable, ...(needsPrivacyNotice ? { privacyNoticeShown: true } : {}) }
            : { displayName, ...editable },
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
        setStatus({ ok: false, message: body?.error?.message ?? "Couldn't save. Check the values and try again." });
        return;
      }
      if (isSetup) {
        router.replace("/");
      } else {
        setStatus({ ok: true, message: "Saved. Every screen now uses these settings." });
      }
      router.refresh(); // re-renders the signed-in layout with the new preferences (SC-005)
    } catch {
      setStatus({ ok: false, message: "You appear to be offline. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      {mode === "setup" && needsPrivacyNotice && <PrivacyNotice />}

      <div className="flex flex-col gap-1">
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" required maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>

      {mode === "setup" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="base-currency-select">Base currency</Label>
          <select
            id="base-currency-select"
            className={selectClass}
            value={prefs.baseCurrency}
            onChange={(e) => set("baseCurrency", e.target.value)}
            aria-describedby="base-currency-help"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p id="base-currency-help" className="text-sm text-muted-foreground">
            Chosen once — it can&apos;t be changed after setup.
          </p>
        </div>
      ) : (
        <p id="base-currency" className="text-sm">
          Base currency: <strong>{prefs.baseCurrency}</strong> (can&apos;t be changed after setup)
        </p>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Number format</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="number-format" checked={prefs.numberFormat === "indian"} onChange={() => set("numberFormat", "indian")} />
          Indian (12,34,567)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="number-format"
            checked={prefs.numberFormat === "international"}
            onChange={() => set("numberFormat", "international")}
          />
          International (1,234,567)
        </label>
      </fieldset>

      <div className="flex flex-col gap-1">
        <Label htmlFor="date-format">Date format</Label>
        <select id="date-format" className={selectClass} value={prefs.dateFormat} onChange={(e) => set("dateFormat", e.target.value)}>
          {DATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="fy-start">Financial year starts in</Label>
        <select
          id="fy-start"
          className={selectClass}
          value={prefs.fyStartMonth}
          onChange={(e) => set("fyStartMonth", Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="timezone">Timezone</Label>
        <select id="timezone" className={selectClass} value={prefs.timezone} onChange={(e) => set("timezone", e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      {mode === "settings" && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="buffer">Safe-to-spend buffer</Label>
          <Input
            id="buffer"
            inputMode="decimal"
            autoComplete="off"
            value={buffer}
            onChange={(e) => {
              setBuffer(e.target.value);
              setStatus(null);
            }}
            aria-describedby="buffer-hint"
            className="w-48"
          />
          <p id="buffer-hint" className="text-sm text-muted-foreground">
            Kept back from what the Dashboard shows as safe to spend.
          </p>
        </div>
      )}

      {mode === "settings" && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <input
              id="plan-nudge-setting"
              type="checkbox"
              checked={prefs.planNudge}
              onChange={(e) => set("planNudge", e.target.checked)}
              aria-describedby="plan-nudge-hint"
            />
            Remind me to check next month&rsquo;s plan
          </label>
          <p id="plan-nudge-hint" className="text-sm text-muted-foreground">
            From the 25th to the 5th, the Dashboard and the Payment plan ask you to check the coming month until you select
            &ldquo;Plan checked&rdquo;. Applies on every device.
          </p>
        </div>
      )}

      {mode === "settings" && (
        <fieldset id="warranty-reminders-settings" className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Warranty reminders</legend>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="warranty-first" className="text-sm">
                First reminder
              </label>
              <select
                id="warranty-first"
                className={selectClass}
                value={prefs.warrantyFirstDays}
                onChange={(e) => {
                  const first = Number(e.target.value) as Preferences["warrantyFirstDays"];
                  set("warrantyFirstDays", first);
                  // The second stays closer to expiry than the first.
                  if (prefs.warrantySecondDays !== null && prefs.warrantySecondDays >= first) {
                    const below = WARRANTY_SECOND_CHOICES.filter((d) => d < first);
                    set("warrantySecondDays", below.length > 0 ? below[below.length - 1]! : null);
                  }
                }}
              >
                {WARRANTY_FIRST_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d} days before
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="warranty-second" className="text-sm">
                Second reminder
              </label>
              <select
                id="warranty-second"
                className={selectClass}
                value={prefs.warrantySecondDays ?? "off"}
                onChange={(e) => set("warrantySecondDays", e.target.value === "off" ? null : (Number(e.target.value) as 15 | 30 | 60))}
              >
                {WARRANTY_SECOND_CHOICES.filter((d) => d < prefs.warrantyFirstDays).map((d) => (
                  <option key={d} value={d}>
                    {d} days before
                  </option>
                ))}
                <option value="off">Off</option>
              </select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            The Dashboard reminds you before a warranty ends. &ldquo;Got it&rdquo; hides a reminder until the next one. Applies on every device.
          </p>
        </fieldset>
      )}

      <section id="format-preview" aria-labelledby="preview-title" className="rounded-md border border-border p-3 text-sm">
        <h2 id="preview-title" className="mb-1 font-medium">
          Preview
        </h2>
        <DisplayProvider preferences={prefs}>
          <p>
            Amount: <Money value={SAMPLE_AMOUNT} />
          </p>
          <p>
            Today: <DateText instant={nowIso} />
          </p>
          <p>Financial year: {fy.label}</p>
        </DisplayProvider>
      </section>

      {status && (
        <Alert id="preferences-status" variant={status.ok ? "default" : "destructive"} role="status">
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Saving…" : mode === "setup" ? "Finish setup" : "Save preferences"}
      </Button>
    </form>
  );
}
