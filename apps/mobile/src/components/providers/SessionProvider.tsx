import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MeResponse } from "@ft/core";
import { api, setForcedSignOutHandler } from "@/lib/api";
import { envResult } from "@/lib/env";
import { localData } from "@/lib/local-data";
import { supabase } from "@/lib/supabase";

const ME_CACHE_KEY = "ft.me";

type ConfigState = "checking" | "ok" | "mismatch" | "invalid";

interface SessionContextValue {
  ready: boolean;
  config: ConfigState;
  session: Session | null;
  /** Profile + preferences (GET /api/me), cached on the phone for offline use (T083, FR-012). */
  me: MeResponse | null;
  /** Re-reads /api/me (e.g. after setup or a preference change). */
  refreshMe: () => Promise<void>;
  /** Clears the local session after a forced sign-out. */
  forcedSignOut: (reason: "inactive" | "removed") => Promise<void>;
  lastForcedReason: "inactive" | "removed" | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadCachedMe(userId: string): Promise<MeResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_CACHE_KEY);
    const cached = raw ? (JSON.parse(raw) as MeResponse) : null;
    return cached?.id === userId ? cached : null;
  } catch {
    return null;
  }
}

/**
 * Session + profile/preferences state for the auth gate. Works offline: the session comes from
 * secure storage and /api/me from a local cache, refreshed from the server when reachable.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // An invalid build has nothing to load: it is immediately ready to show the config-error screen.
  const [ready, setReady] = useState(!envResult.success);
  const [config, setConfig] = useState<ConfigState>(envResult.success ? "checking" : "invalid");
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [lastForcedReason, setLastForcedReason] = useState<"inactive" | "removed" | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const next = await api<MeResponse>("/api/me");
      setMe(next);
      await AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(next)).catch(() => undefined);
    } catch {
      // Offline or transient: keep the cached copy. Inactive/removed users are signed out by api().
    }
  }, []);

  const forcedSignOut = useCallback(async (reason: "inactive" | "removed") => {
    const userId = (await supabase().auth.getSession()).data.session?.user.id;
    await supabase().auth.signOut({ scope: "local" }).catch(() => undefined);
    if (userId && reason === "removed") await localData.wipeAll(userId);
    await AsyncStorage.removeItem(ME_CACHE_KEY).catch(() => undefined);
    setMe(null);
    setLastForcedReason(reason);
  }, []);

  useEffect(() => {
    if (!envResult.success) return;
    const client = supabase();
    const expectedEnv = envResult.data.appEnv;
    setForcedSignOutHandler((reason) => void forcedSignOut(reason));

    // FR-019a: refuse to run against a backend of another environment (when reachable).
    client
      .schema("app")
      .rpc("health")
      .then(
        ({ data }) => {
          const env = (data as { environment?: string } | null)?.environment;
          setConfig(env && env !== expectedEnv ? "mismatch" : "ok");
        },
        () => setConfig("ok"), // offline: keep working from the local session
      );

    client.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        setMe(await loadCachedMe(data.session.user.id));
        void fetchMe();
      }
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void fetchMe();
      else setMe(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchMe, forcedSignOut]);

  const value = useMemo(
    () => ({ ready, config, session, me, refreshMe: fetchMe, forcedSignOut, lastForcedReason }),
    [ready, config, session, me, fetchMe, forcedSignOut, lastForcedReason],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
