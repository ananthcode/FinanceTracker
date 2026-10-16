// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = (async () => {
  // Amounts and dates only through <Money>/<DateText> (constitution XIII, T011).
  const { appRules } = await import("@ft/config/eslint");
  return defineConfig([expoConfig, ...appRules, { ignores: ["dist/*", ".expo/*"] }]);
})();
