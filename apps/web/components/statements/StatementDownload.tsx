"use client";

import { useId, useState } from "react";
import { pdfFromJpegPages, statementDocument, statementFileName, type DateFormat, type PersonStatement } from "@ft/core";
import { useDisplay } from "@/components/providers/DisplayProvider";
import { Button } from "@/components/ui/button";
import { drawStatementPages, pagesToJpeg, pagesToPng } from "@/lib/statement-canvas";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads the statement as a PNG image or a PDF (R6 FR-011; spec US4 3, 5). The files are drawn here
 * in the browser: nothing is uploaded or logged, and the app sends nothing itself. They show real
 * amounts even with hide-balances on, and notes only with "Include notes" on (off for every visit).
 */
export function StatementDownload({
  statement,
  personName,
  displayName,
}: {
  statement: PersonStatement;
  personName: string;
  displayName: string;
}) {
  const ids = useId();
  const { preferences } = useDisplay();
  const [includeNotes, setIncludeNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function download(format: "png" | "pdf") {
    setBusy(true);
    setStatus(null);
    try {
      const doc = statementDocument(statement, {
        personName,
        displayName,
        currency: preferences.baseCurrency,
        prefs: { numberFormat: preferences.numberFormat, dateFormat: preferences.dateFormat as DateFormat },
        includeNotes,
      });
      const pages = drawStatementPages(doc);
      const blob =
        format === "png"
          ? await pagesToPng(pages)
          : new Blob([pdfFromJpegPages(await pagesToJpeg(pages)) as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
      const name = statementFileName(personName, statement.from, statement.to, format);
      save(blob, name);
      setStatus({ ok: true, message: `Downloaded ${name}.` });
    } catch (e) {
      setStatus({
        ok: false,
        message:
          e instanceof Error && e.message === "STATEMENT_TOO_LONG_FOR_IMAGE"
            ? "This statement is too long for one image. Download the PDF, or choose a shorter range."
            : "The file could not be made. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 id={`${ids}-title`} className="text-lg font-medium">
        Share this statement
      </h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
        Include notes
      </label>
      <p className="text-sm text-muted-foreground">
        The file shows your name, this person, the dates, every row and the closing balance, with real amounts. It never shows account names.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => download("png")}>
          Download image (PNG)
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => download("pdf")}>
          Download PDF
        </Button>
      </div>
      <p role="status" className={`text-sm ${status && !status.ok ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
        {status?.message}
      </p>
    </section>
  );
}
