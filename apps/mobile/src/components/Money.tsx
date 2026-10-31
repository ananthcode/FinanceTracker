import { Text, type TextProps } from "react-native";
import { formatMoney, maskMoney } from "@ft/core";
import { useDisplay } from "@/components/providers/DisplayProvider";

/**
 * The ONLY way the Android app renders an amount (lint rule T011): user's number format plus the
 * per-device hide-balances mask (FR-032). `value` is integer minor units.
 */
export function Money({ value, currency, ...rest }: { value: bigint; currency?: string } & TextProps) {
  const { preferences, hideBalances } = useDisplay();
  const code = currency ?? preferences.baseCurrency;
  if (hideBalances) {
    return (
      <Text accessibilityLabel="Amount hidden" {...rest}>
        {maskMoney(code)}
      </Text>
    );
  }
  return <Text {...rest}>{formatMoney(value, code, preferences)}</Text>;
}

/** The same text as <Money>, for places that need a plain string (alerts, confirmations). */
export function useMoneyText(): (value: bigint, currency?: string) => string {
  const { preferences, hideBalances } = useDisplay();
  return (value, currency) => {
    const code = currency ?? preferences.baseCurrency;
    return hideBalances ? maskMoney(code) : formatMoney(value, code, preferences);
  };
}
