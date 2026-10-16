/**
 * Shared ESLint rules for apps (flat config fragment).
 *
 * Every amount and date shown in UI must go through the single Money / DateText component of each
 * app, so hide-balances and user preferences apply everywhere (constitution XIII, research R-11).
 * Apps spread `appRules` into their own eslint.config.mjs.
 */
export const appRules = [
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/components/Money.tsx", "**/components/DateText.tsx", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@ft/core",
              importNames: ["formatMoney", "maskMoney", "formatDate"],
              message:
                "Render amounts with <Money> and dates with <DateText> so hide-balances and user preferences apply (constitution XIII).",
            },
          ],
        },
      ],
    },
  },
];

export default appRules;
