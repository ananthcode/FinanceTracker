"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkPassword, PASSWORD_PROBLEM_MESSAGES } from "@ft/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** New password with live policy hints (FR-007); other sessions end on success (FR-010). */
export function ResetForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = password ? checkPassword(password, email) : null;
  const hint = check && !check.ok ? PASSWORD_PROBLEM_MESSAGES[check.reason] : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
      setError(body?.error?.message ?? "Couldn't change the password. Please try again.");
    } catch {
      setError("You appear to be offline. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-sm text-muted-foreground" aria-live="polite">
          {hint ?? "At least 8 characters; avoid common passwords."}
        </p>
      </div>
      {error && (
        <Alert variant="destructive" id="reset-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={busy || (check !== null && !check.ok)}>
        {busy ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
