"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DATE_FORMATS, fiscalYearOf, type Preferences } from "@ft/core";
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
    const { baseCurrency, categoriesStart, ...editable } = prefs;
    void categoriesStart;
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
