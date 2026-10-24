"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { kind: "sent" | "failed" | "error"; message: string };

/** Owner invites a person by email (FR-002, FR-003b). The link itself is never shown (FR-003a). */
export function InviteForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as
        | { deliveryStatus?: "sent" | "failed"; expiresAt?: string; error?: { message: string } }
        | null;
      if (res.ok && body?.deliveryStatus === "sent") {
        setResult({ kind: "sent", message: `Invitation emailed to ${email}. It expires in 7 days.` });
        setEmail("");
      } else if (res.ok) {
        setResult({ kind: "failed", message: "The invitation was saved, but the email could not be sent. Check email settings, then resend." });
      } else {
        setResult({ kind: "error", message: body?.error?.message ?? "Could not create the invitation." });
      }
    } catch {
      setResult({ kind: "error", message: "You appear to be offline." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby="invite-title">
      <h2 id="invite-title" className="text-lg font-medium">
        Invite someone
      </h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send invitation"}
      </Button>
      {result && (
        <Alert id="invite-result" variant={result.kind === "sent" ? "default" : "destructive"} role="status">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
