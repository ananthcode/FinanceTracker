"use client";

import { useId, useState } from "react";
import { formatBytes, MIN_PASSWORD, periodOf, type DateRange, type NumberFormat } from "@ft/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildExport, download, logExport, type ExportFormat } from "@/lib/export-client";

type RangeChoice = "everything" | "this_month" | "last_month" | "this_fy" | "last_fy" | "custom";

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "backup", label: "Backup (JSON)", hint: "Everything, to keep safe and import again later." },
  { value: "xlsx", label: "Excel workbook", hint: "A sheet per record type, for looking at in a spreadsheet." },
  { value: "csv", label: "CSV files (zip)", hint: "A plain file per record type, for any spreadsheet or tool." },
];

const RANGES: { value: RangeChoice; label: string }[] = [
  { value: "everything", label: "Everything" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_fy", label: "This financial year" },
  { value: "last_fy", label: "Last financial year" },
  { value: "custom", label: "Choose dates" },
];

/**
 * Settings › Your data › Export (R10 US1–US3): a backup to keep (optionally locked with a password, clarify
 * Q1), or Excel / CSV for reading, with a date range; optionally with the attachment files. Made in the
 * browser; only a record that it happened goes to the server.
 */
export function ExportData({
  today,
  fyStartMonth,
  numberFormat,
  usage,
}: {
  today: string;
  fyStartMonth: number;
  numberFormat: NumberFormat;
  usage: { files: number; bytes: string } | null;
}) {
  const ids = useId();
  const [format, setFormat] = useState<ExportFormat>("backup");
  const [rangeChoice, setRangeChoice] = useState<RangeChoice>("everything");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);
  const [files, setFiles] = useState(false);
  const [lock, setLock] = useState(false);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function range(): DateRange | null | string {
    switch (rangeChoice) {
      case "everything":
        return null;
      case "this_month":
      case "last_month":
      case "this_fy":
        return periodOf(rangeChoice, today, fyStartMonth);
      case "last_fy": {
        const fy = periodOf("this_fy", today, fyStartMonth);
        const start = `${Number(fy.from.slice(0, 4)) - 1}${fy.from.slice(4)}`;
        const end = new Date(`${fy.from}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() - 1);
        return { from: start, to: end.toISOString().slice(0, 10) };
      }
      case "custom":
        if (!from || !to) return "Choose both dates.";
        if (from > to) return "The first date is after the last.";
        return { from, to };
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    const r = format === "backup" ? null : range();
    if (typeof r === "string") return setProblem(r);
    if (format === "backup" && lock) {
      if ([...password].length < MIN_PASSWORD) return setProblem(`Use a password of at least ${MIN_PASSWORD} characters.`);
      if (password !== again) return setProblem("The two passwords are not the same.");
    }
    const options = { format, range: r, files, password: format === "backup" && lock ? password : null, today, numberFormat };
    setBusy(true);
    try {
      const result = await buildExport(options, setStatus);
      download(result.blob, result.fileName);
      setStatus(`Downloaded ${result.fileName} (${formatBytes(result.blob.size)}).`);
      void logExport(options, result.counts);
    } catch (err) {
      setStatus(null);
      setProblem(err instanceof Error ? err.message : "The export did not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="export" aria-labelledby={`${ids}-title`} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <h3 id={`${ids}-title`} className="font-medium">
        Export
      </h3>
      <form onSubmit={(e) => void run(e)} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Format</legend>
          {FORMATS.map((f) => (
            <label key={f.value} className="flex items-start gap-2 text-sm">
              <input type="radio" name={`${ids}-format`} value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} className="mt-1" />
              <span>
                <span className="font-medium">{f.label}</span> — {f.hint}
              </span>
            </label>
          ))}
        </fieldset>

        {format !== "backup" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-range`}>Transactions</Label>
              <select id={`${ids}-range`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={rangeChoice} onChange={(e) => setRangeChoice(e.target.value as RangeChoice)}>
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {rangeChoice === "custom" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-from`}>From</Label>
                  <Input id={`${ids}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-to`}>To</Label>
                  <Input id={`${ids}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            <p className="w-full text-sm text-muted-foreground">Accounts, people, categories and the plan are always included in full.</p>
          </div>
        )}

        {usage && usage.files > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={files} onChange={(e) => setFiles(e.target.checked)} />
            Include attachments ({usage.files === 1 ? "1 file" : `${usage.files} files`}, up to {formatBytes(BigInt(usage.bytes))}; makes a zip)
          </label>
        )}

        {format === "backup" && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
              Lock with a password
            </label>
            {lock && (
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-password`}>Password</Label>
                  <Input id={`${ids}-password`} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={`${ids}-lock-hint`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-again`}>Password again</Label>
                  <Input id={`${ids}-again`} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
                </div>
                <p id={`${ids}-lock-hint`} className="w-full text-sm text-muted-foreground">
                  The backup can only be imported with this password. If you forget it, the backup cannot be opened — nobody can recover it.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground">The file holds your amounts even when balances are hidden on screen. Keep it somewhere safe.</p>
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? "Exporting…" : "Export"}
        </Button>
      </form>
      <p role="status" className="text-sm">
        {status}
      </p>
      {problem && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
