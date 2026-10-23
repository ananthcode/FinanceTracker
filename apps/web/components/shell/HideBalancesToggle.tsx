"use client";

import { Eye, EyeOff } from "lucide-react";
import { useDisplay } from "@/components/providers/DisplayProvider";

/**
 * Per-browser hide-balances switch in the navigation header (US7, FR-031–FR-033). The state lives
 * in this browser only; every <Money> re-renders from it at once.
 */
export function HideBalancesToggle() {
  const { hideBalances, setHideBalances } = useDisplay();
  const Icon = hideBalances ? EyeOff : Eye;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hideBalances}
      aria-label="Hide balances"
      title={hideBalances ? "Balances hidden — show them" : "Hide balances"}
      onClick={() => setHideBalances(!hideBalances)}
      className="rounded-md p-2 hover:bg-black/5 dark:hover:bg-white/5"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
