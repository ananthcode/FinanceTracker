"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkPassword, PASSWORD_PROBLEM_MESSAGES } from "@ft/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Join with email + password or Google, after the privacy notice is shown (FR-001, FR-004, FR-036e). */
export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = password ? checkPassword(password, email) : null;
  const hint = check && !check.ok ? PASSWORD_PROBLEM_MESSAGES[check.reason] : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, keepSignedIn, device: "web", privacyNoticeShown: true }),
      });
      if (res.ok) {
        router.replace("/setup");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("You appear to be offline. Please try again.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3" aria-describedby={error ? "accept-error" : undefined}>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">Your email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="password">Choose a password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={hint ? true : undefined}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-sm text-muted" aria-live="polite">
            {hint ?? "At least 8 characters; avoid common passwords."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
          Keep me signed in on this browser
        </label>
        {error && (
          <Alert variant="destructive" id="accept-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={busy || (check !== null && !check.ok)}>
          {busy ? "Joining…" : "Join with email"}
        </Button>
      </form>
      <div className="flex items-center gap-2 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      {/* Server-side OAuth start keeps the PKCE verifier and session in HttpOnly cookies (FR-036b). */}
      <a
        href={`/auth/google?next=/setup${keepSignedIn ? "&keep=1" : ""}`}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
      >
        Continue with Google
      </a>
    </div>
  );
}
