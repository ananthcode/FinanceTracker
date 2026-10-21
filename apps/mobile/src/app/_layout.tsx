import "../global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { DisplayProvider } from "@/components/providers/DisplayProvider";
import { SessionProvider, useSession } from "@/components/providers/SessionProvider";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Auth gate (T042): routes are protected by session and setup state using Expo Router's
 * Stack.Protected. Invitation links stay reachable in every state (FR-004a).
 */
function Gate() {
  const { ready, config, session, me } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  const configBad = config === "invalid" || config === "mismatch";
  const signedIn = !configBad && session !== null;
  const setupDone = signedIn && me?.setupComplete === true;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={configBad}>
        <Stack.Screen name="config-error" />
      </Stack.Protected>
      <Stack.Protected guard={!configBad && !signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !setupDone}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={setupDone}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!configBad}>
        <Stack.Screen name="invite/[token]" />
      </Stack.Protected>
    </Stack>
  );
}

/** T083: saved preferences (cached for offline) drive every amount and date. */
function DisplayFromSession({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  return <DisplayProvider preferences={me?.preferences}>{children}</DisplayProvider>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <DisplayFromSession>
          <Gate />
        </DisplayFromSession>
      </SessionProvider>
    </ThemeProvider>
  );
}
