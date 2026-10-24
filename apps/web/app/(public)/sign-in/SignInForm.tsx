"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Email + password sign-in with lockout messaging, plus Google (FR-006, FR-009, FR-010). */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, keepSignedIn, device: "web" }),
      });
      const body = (await res.json().catch(() => null)) as
        | { user?: { setupComplete: boolean }; error?: { message: string } }
        | null;
      if (res.ok && body?.user) {
        router.replace(body.user.setupComplete ? next : "/setup");
        router.refresh();
        return;
      }
      setError(body?.error?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("You appear to be offline. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
          Keep me signed in on this browser
        </label>
        {error && (
          <Alert variant="destructive" id="sign-in-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Link href="/forgot-password" className="text-sm underline">
        Forgot your password?
      </Link>
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <a
        href={`/auth/google?next=${encodeURIComponent(next)}${keepSignedIn ? "&keep=1" : ""}`}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
      >
        Continue with Google
      </a>
    </div>
  );
}
