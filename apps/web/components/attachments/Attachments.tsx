"use client";

import { useId, useRef, useState } from "react";
import { ATTACHMENTS_PER_TRANSACTION, formatBytes, type AttachmentView } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateText } from "@/components/DateText";
import { Button, buttonVariants } from "@/components/ui/button";
import { attachFile, attachMessage, cleanupAttachmentFiles, savedText } from "@/lib/attachments";
import { changes, useSyncPush } from "@/lib/sync-client";

/**
 * A transaction's receipts (R9 US1): list with previews, Open, Delete, and "Attach a receipt". Files open
 * through a link that works for two minutes (FR-003); photos are made smaller before upload (FR-002).
 */
export function Attachments({
  transactionId,
  attachments,
  attachFailed = false,
}: {
  transactionId: string;
  attachments: AttachmentView[];
  /** Arrived here because a receipt picked while adding did not go (US1 6). */
  attachFailed?: boolean;
}) {
  const ids = useId();
  const push = useSyncPush();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(
    attachFailed ? "The transaction was saved, but a receipt could not be attached. Please attach it again." : null,
  );
  const [deleting, setDeleting] = useState<AttachmentView | null>(null);
  const full = attachments.length >= ATTACHMENTS_PER_TRANSACTION;

  async function onPick(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setStatus(null);
    setProblem(null);
    const room = ATTACHMENTS_PER_TRANSACTION - attachments.length;
    let done = 0;
    let saved = 0;
    const problems: string[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      setStatus(`Attaching ${file.name}…`);
      const result = await attachFile(transactionId, file, push);
      if (result.ok) {
        done++;
        saved += result.savedBytes ?? 0;
      } else problems.push(`${file.name}: ${result.message}`);
    }
    if (files.length > room) problems.push(attachMessage("LIMIT_REACHED"));
    setBusy(false);
    if (input.current) input.current.value = "";
    setStatus(done > 0 ? `${done === 1 ? "Attached" : `${done} attached`}.${saved > 0 ? ` ${savedText(saved)}` : ""}` : null);
    setProblem(problems.length > 0 ? problems.join(" ") : null);
  }

  async function onDelete(a: AttachmentView) {
    setBusy(true);
    const outcome = await push([changes.deleteAttachment(a.id)]);
    setBusy(false);
    setDeleting(null);
    const result = outcome.ok ? outcome.results[0] : undefined;
    if (!outcome.ok || result?.status === "rejected") {
      setProblem("The attachment could not be deleted. Please try again.");
      return;
    }
    setStatus(`${a.name} deleted.`);
    void cleanupAttachmentFiles();
  }

  return (
    <section id="attachments" aria-labelledby={`${ids}-title`} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <h2 id={`${ids}-title`} className="text-lg font-semibold">
        Attachments
      </h2>
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => (
            <li key={a.id} data-attachment={a.id} className="flex flex-wrap items-center gap-3">
              {a.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived private link, not an optimisable asset
                <img src={`/api/attachments/${a.id}`} alt="" width={48} height={48} loading="lazy" className="size-12 rounded border border-border object-cover" />
              ) : (
                <span aria-hidden="true" className="flex size-12 items-center justify-center rounded border border-border text-xs font-semibold">
                  PDF
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{a.name}</span>
                <span className="text-sm text-muted-foreground">
                  {a.contentType === "application/pdf" ? "PDF" : "Photo"} · {formatBytes(a.sizeBytes)} · added <DateText instant={a.createdAt} />
                </span>
              </div>
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open<span className="sr-only"> {a.name}</span>
              </a>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDeleting(a)}>
                Delete<span className="sr-only"> {a.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-file`} className="text-sm font-medium">
          Attach a receipt
        </label>
        <input
          ref={input}
          id={`${ids}-file`}
          type="file"
          multiple
          disabled={busy || full}
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif,.pdf"
          className="text-sm"
          aria-describedby={`${ids}-hint`}
          onChange={(e) => void onPick(Array.from(e.target.files ?? []))}
        />
        <p id={`${ids}-hint`} className="text-sm text-muted-foreground">
          {full ? attachMessage("LIMIT_REACHED") : "Photos (made smaller, without location details) or PDFs up to 10 MB."}
        </p>
      </div>
      <p role="status" className="text-sm">
        {status}
      </p>
      {problem && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this attachment?"
          confirmLabel="Delete"
          destructive
          busy={busy}
          onConfirm={() => void onDelete(deleting)}
          onCancel={() => setDeleting(null)}
        >
          {deleting.name} is removed from the transaction and from storage.
        </ConfirmDialog>
      )}
    </section>
  );
}
