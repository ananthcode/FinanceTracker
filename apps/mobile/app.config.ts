import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Per-environment app config (constitution VI, research R-15). Each environment builds a separate
 * Android app with its own application ID so demo and live can be installed side by side.
 */
const appEnv = process.env.EXPO_PUBLIC_APP_ENV === "live" ? "live" : "demo";
const baseId = "com.ananthcode.financetracker";
const androidPackage = appEnv === "live" ? baseId : `${baseId}.demo`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appEnv === "live" ? "Finance Tracker" : "Finance Tracker (Demo)",
  slug: "finance-tracker",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "financetracker",
  userInterfaceStyle: "automatic",
  android: {
    package: androidPackage,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-secure-store",
    [
      "expo-local-authentication",
      { faceIDPermission: "Allow Finance Tracker to use biometrics to unlock the app." },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appEnv,
  },
});
