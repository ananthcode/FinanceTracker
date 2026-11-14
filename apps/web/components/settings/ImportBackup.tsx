"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { BACKUP_ENTITIES, formatBytes, type LockedBackup, type LockKey } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Dialog } from "@/components/Dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allowanceText, fitsAllowance, prepare, readBackupFile, runImport, undoOpenImport, unlockFile, type Prepared } from "@/lib/import-client";

const NAMES: Record<string, [string, string]> = {
  account_group: ["account group", "account groups"],
  account: ["account", "accounts"],
  category: ["category", "categories"],
  tag: ["tag", "tags"],
  payee: ["payee or person", "payees and people"],
  person_rate: ["interest rate", "interest rates"],
  plan_item: ["planned payment", "planned payments"],
  plan_occurrence: ["plan month", "plan months"],
  template: ["quick-add template", "quick-add templates"],
  transaction: ["transaction", "transactions"],
  attachment: ["attachment", "attachments"],
};

export function describeCounts(counts: Record<string, number | undefined>): string {
  const parts = BACKUP_ENTITIES.filter((e) => (counts[e] ?? 0) > 0).map((e) => {
    const n = counts[e]!;
    return `${n.toLocaleString("en-IN")} ${NAMES[e]![n === 1 ? 0 : 1]}`;
  });
  if (parts.length === 0) return "nothing";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const WORD = "RESET";

/**
 * Settings › Your data › Import a backup (R10 US1, US3): choose the file, unlock it, see what it holds, then
 * import into empty data — or reset and import after typing RESET. All or nothing (FR-012); a report says
 * what was restored. An import left unfinished can be undone.
 */
export function ImportBackup({
  empty,
  baseCurrency,
  openImport,
}: {
  empty: boolean;
  baseCurrency: string;
  openImport: { importId: string; startedAt: string } | null;
}) {
  const ids = useId();
  const router = useRouter();
  const [files, setFiles] = useState<Map<string, Uint8Array>>(new Map());
  const [locked, setLocked] = useState<LockedBackup | null>(null);
  const [password, setPassword] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [key, setKey] = useState<LockKey | null>(null);
  const [withFiles, setWithFiles] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [unfinished, setUnfinished] = useState(openImport);

  function reset() {
    setLocked(null);
    setPrepared(null);
    setKey(null);
    setProblems([]);
    setReport(null);
    setStatus(null);
  }

  function ready(backup: Parameters<typeof prepare>[0], entries: Map<string, Uint8Array>, k: LockKey | null) {
    const p = prepare(backup, entries, baseCurrency);
    if ("problems" in p) return setProblems(p.problems);
    setPrepared(p);
    setKey(k);
    setWithFiles(p.fileCount > 0 && fitsAllowance(p));
  }

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    setBusy(true);
    setStatus("Checking the file…");
    const read = await readBackupFile(file);
    setBusy(false);
    setStatus(null);
    setFiles(read.kind === "problem" ? new Map() : read.files);
    if (read.kind === "problem") return setProblems([read.problem]);
    if (read.kind === "locked") return setLocked(read.locked);
    ready(read.backup, read.files, null);
  }

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!locked) return;
    setBusy(true);
    setStatus("Unlocking…");
    const read = await unlockFile(locked, files, password);
    setBusy(false);
    setStatus(null);
    if (read.kind !== "ready") return setProblems([read.kind === "problem" ? read.problem : "This backup is damaged."]);
    setProblems([]);
    setLocked(null);
    ready(read.backup, read.files, read.key);
  }

  async function onImport(resetFirst: boolean) {
    if (!prepared) return;
    setAsking(false);
    setBusy(true);
    setProblems([]);
    try {
      const outcome = await runImport(prepared, files, key, { reset: resetFirst, withFiles }, setStatus);
      const filesText = prepared.fileCount > 0 ? (withFiles ? ` ${outcome.filesRestored === 1 ? "1 attachment file" : `${outcome.filesRestored} attachment files`} restored.` : " Attachment files were not restored.") : "";
      setReport(`Imported: ${describeCounts(outcome.counts)}.${filesText}${outcome.preferencesRestored ? "" : " Your preferences were kept as they were."}`);
      setPrepared(null);
      setStatus(null);
      router.refresh();
    } catch (err) {
      setStatus(null);
      setProblems([`Nothing was imported: ${err instanceof Error ? err.message : "the import did not finish"}`]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onUndo() {
    if (!unfinished) return;
    setBusy(true);
    const ok = await undoOpenImport(unfinished.importId);
    setBusy(false);
    if (ok) {
      setUnfinished(null);
      setReport("The unfinished import was undone. Your data is empty.");
      router.refresh();
    } else setProblems(["The unfinished import could not be undone. Please try again."]);
  }

  return (
    <section id="import" aria-labelledby={`${ids}-title`} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <h3 id={`${ids}-title`} className="font-medium">
        Import a backup
      </h3>
      {unfinished && (
        <Alert role="alert">
          <AlertDescription className="flex flex-col gap-2">
            An import did not finish, so your data may be incomplete. Undo it to start again.
            <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => void onUndo()}>
              Undo the unfinished import
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <p className="max-w-prose text-sm text-muted-foreground">
        A backup made by Export › Backup restores everything it holds. It can only go into empty data: your current data is replaced, never mixed.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-file`}>Backup file</Label>
        <input id={`${ids}-file`} type="file" accept=".json,.zip,application/json,application/zip" className="text-sm" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>

      {locked && (
        <form onSubmit={(e) => void onUnlock(e)} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-password`}>This backup is locked. Password</Label>
            <Input id={`${ids}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || password === ""}>
            Unlock
          </Button>
        </form>
      )}

      {prepared && (
        <div id="import-contents" className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <p>
            Backup from <DateText date={prepared.backup.exportedAt.slice(0, 10)} />: {describeCounts(prepared.counts)}.
          </p>
          {prepared.fileCount > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={withFiles} disabled={!fitsAllowance(prepared)} onChange={(e) => setWithFiles(e.target.checked)} />
              Restore the attachment files ({prepared.fileCount}, {formatBytes(prepared.fileBytes)})
              {!fitsAllowance(prepared) && ` — too big: ${allowanceText(prepared)}`}
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {empty ? (
              <Button type="button" disabled={busy} onClick={() => void onImport(false)}>
                Import
              </Button>
            ) : (
              <>
                <p className="w-full">Your data is not empty. Importing replaces it: everything you have now is removed first.</p>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => setAsking(true)}>
                  Reset and import
                </Button>
              </>
            )}
            <Button type="button" variant="outline" disabled={busy} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p role="status" className="text-sm">
        {status ?? report}
      </p>
      {problems.length > 0 && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {problems.length === 1 ? (
              problems[0]
            ) : (
              <>
                This backup cannot be imported:
                <ul className="mt-1 list-disc pl-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {asking && (
        <Dialog title="Reset and import?" onClose={() => setAsking(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed === WORD) void onImport(true);
            }}
            className="flex flex-col gap-3"
          >
            <p className="text-sm">Everything you have recorded is permanently removed, then the backup is imported. This cannot be undone.</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-confirm`}>Type RESET to confirm</Label>
              <Input id={`${ids}-confirm`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={typed !== WORD}>
                Reset and import
              </Button>
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
