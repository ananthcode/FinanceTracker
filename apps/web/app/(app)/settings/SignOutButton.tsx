"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Signs out of this browser only (FR-011). */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "web" }),
    }).catch(() => undefined);
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={signOut} disabled={busy} className="self-start">
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
