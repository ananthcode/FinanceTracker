"use client";

import { formatMoney, maskMoney } from "@ft/core";
import { useDisplay } from "@/components/providers/DisplayProvider";

/**
 * The ONLY way the web app renders an amount (lint rule T011): applies the user's number format
 * and the per-device hide-balances mask (FR-032). Amounts are integer minor units.
 */
export function Money({
  value,
  currency,
  className,
}: {
  value: bigint;
  currency?: string;
  className?: string;
}) {
  const { preferences, hideBalances } = useDisplay();
  const code = currency ?? preferences.baseCurrency;
  if (hideBalances) {
    return (
      <span className={className} aria-label="Amount hidden">
        {maskMoney(code)}
      </span>
    );
  }
  return <span className={className}>{formatMoney(value, code, preferences)}</span>;
}
