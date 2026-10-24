"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";

/**
 * Two-step erase confirmation (FR-016a): (1) warning of exactly what is erased and that it cannot be
 * undone, then (2) typing the user's email exactly. Nothing is erased until both are done.
 */
export function EraseDialog({
  user,
  onClose,
  onErased,
}: {
  user: { id: string; email: string };
  onClose: () => void;
  onErased: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  async function erase() {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/admin/users/${user.id}/erase`, { body: { confirmEmail: typed.trim() } });
    setBusy(false);
    if (res.ok) onErased();
    else setError(res.error?.message ?? "Couldn't erase this user.");
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="erase-title"
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-md border border-border bg-background p-4 shadow-lg backdrop:bg-black/40"
    >
      <h2 id="erase-title" className="mb-2 text-lg font-semibold">
        Erase {user.email}?
      </h2>
      {step === 1 ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>This permanently erases:</p>
          <ul className="list-disc pl-5">
            <li>their sign-in access,</li>
            <li>their preferences,</li>
            <li>all of their financial data,</li>
            <li>their name and email from the activity history.</li>
          </ul>
          <p className="font-medium">This cannot be undone. You will not see any of their data during erasure.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <Label htmlFor="erase-confirm">Type the user&apos;s email to confirm</Label>
          <Input id="erase-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!matches || busy} onClick={erase}>
              {busy ? "Erasing…" : "Erase permanently"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
