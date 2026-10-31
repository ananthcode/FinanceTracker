import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api } from "@/lib/api";
import { AppLockController } from "@/lib/app-lock/controller";
import { clearPin, verifyPin } from "@/lib/app-lock/pin";
import { setRecentsPreviewHidden } from "@/lib/app-lock/recents-privacy";
import { loadSettings, saveSettings, type AppLockSettings } from "@/lib/app-lock/settings-store";
import { localData } from "@/lib/local-data";
import { supabase } from "@/lib/supabase";
import { LockScreen } from "@/components/LockScreen";
import { PrivacyOverlay } from "@/components/PrivacyOverlay";
import { useSession } from "./SessionProvider";

interface AppLockContextValue {
  settings: AppLockSettings | null;
  controller: AppLockController;
  /** Re-reads the settings after the settings screen changed them. */
  reload: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

async function signOutHere(): Promise<void> {
  await api("/api/auth/sign-out", { body: { device: "android" } }).catch(() => undefined);
  await supabase().auth.signOut({ scope: "local" }).catch(() => undefined);
}

/**
 * App lock on Android (R1 US6; FR-026 – FR-029): hides every screen behind the lock screen on a
 * cold start and after the chosen time in the background, and hides the recent-apps preview while
 * the lock is on (FR-027). Screenshots stay allowed.
 */
export function AppLockProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [settings, setSettings] = useState<AppLockSettings | null>(null);
  const [locked, setLocked] = useState(false);
  const started = useRef(false);

  const controller = useMemo(
    () =>
      new AppLockController({
        load: loadSettings,
        save: async (s) => {
          await saveSettings(s);
          setSettings(s);
        },
        verifyPin,
        clearPin,
        async signOutKeepingPending() {
          const id = (await supabase().auth.getSession()).data.session?.user.id;
          if (id) await localData.wipeExceptPending(id); // unsent changes stay sealed for this user
          await signOutHere();
        },
        signOut: signOutHere,
        now: Date.now,
      }),
    [],
  );

  const reload = useCallback(async () => setSettings(await loadSettings()), []);

  // Cold start: open locked when the lock is on.
  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;
    void controller.lockedOnStart().then((lock) => {
      setLocked(lock);
      void reload();
    });
  }, [userId, controller, reload]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") controller.onBackground();
      if (state === "active") void controller.onForeground().then((lock) => lock && setLocked(true));
    });
    return () => sub.remove();
  }, [controller]);

  useEffect(() => {
    void setRecentsPreviewHidden(settings?.enabled === true);
  }, [settings?.enabled]);

  const value = useMemo(() => ({ settings, controller, reload }), [settings, controller, reload]);
  const showLock = locked && userId !== null && settings?.enabled === true;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {settings?.enabled === true && <PrivacyOverlay />}
      {showLock && <LockScreen settings={settings} controller={controller} onUnlocked={() => setLocked(false)} />}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used inside AppLockProvider");
  return ctx;
}
