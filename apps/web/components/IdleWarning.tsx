"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * FR-010 / research R-08: when "Keep me signed in" was not ticked, warn one minute before the
 * 30-minute idle sign-out. "Stay signed in" pings the server so the proxy refreshes activity.
 */
export function IdleWarning({ idleMinutes }: { idleMinutes: number }) {
  const router = useRouter();
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
    const bump = () => {
      lastActivity.current = Date.now();
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, bump, { passive: true });

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivity.current;
      const limitMs = idleMinutes * 60_000;
      if (idleMs >= limitMs) {
        router.replace("/sign-in?reason=idle"); // the proxy has already signed the session out
      } else {
        setWarning(idleMs >= limitMs - 60_000);
      }
    }, 5_000);

    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, bump);
      window.clearInterval(timer);
    };
  }, [idleMinutes, router]);

  async function stay() {
    lastActivity.current = Date.now();
    setWarning(false);
    await fetch("/api/auth/ping").catch(() => undefined);
  }

  if (!warning) return null;
  return (
    <div role="alertdialog" aria-labelledby="idle-title" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-md border border-border bg-background p-4 shadow-lg">
      <p id="idle-title" className="mb-2 font-medium">
        You&apos;ll be signed out in about a minute because you&apos;ve been inactive.
      </p>
      <Button onClick={stay}>Stay signed in</Button>
    </div>
  );
}
