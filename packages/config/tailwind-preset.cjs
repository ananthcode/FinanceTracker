/**
 * Shared design tokens for web (Tailwind CSS 4 via @config) and mobile (NativeWind / Tailwind 3).
 * Colour is never the only signal for meaning (constitution XIII): amounts also carry a sign
 * and/or label.
 */
const colors = {
  brand: { DEFAULT: "#1f6feb", foreground: "#ffffff" },
  income: "#1a7f37",
  expense: "#cf222e",
  muted: "#6e7781",
  surface: "#ffffff",
  "surface-dark": "#0d1117",
  border: "#d0d7de",
  demo: "#9a6700",
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors,
      borderRadius: { sm: "4px", md: "8px", lg: "12px" },
    },
  },
};
