/** NativeWind (Tailwind 3) config sharing the monorepo design tokens. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), require("@ft/config/tailwind-preset")],
};
