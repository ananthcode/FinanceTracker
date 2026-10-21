"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Always shows the same neutral confirmation — never reveals whether the email exists (FR-008). */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setSent(body?.message ?? "If an account exists for that email, we've sent a reset link.");
    } catch {
      setSent("You appear to be offline. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      {sent && (
        <p id="reset-sent" role="status" className="text-sm">
          {sent}
        </p>
      )}
      <Link href="/sign-in" className="text-sm underline">
        Back to sign in
      </Link>
    </form>
  );
}
