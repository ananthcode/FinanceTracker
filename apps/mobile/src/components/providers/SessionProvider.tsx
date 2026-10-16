import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setForcedSignOutHandler } from "@/lib/api";
import { envResult } from "@/lib/env";
import { localData } from "@/lib/local-data";
import { supabase } from "@/lib/supabase";

const PROFILE_CACHE_KEY = "ft.profile";

export interface CachedProfile {
  userId: string;
  role: "owner" | "member";
  setupComplete: boolean;
}

type ConfigState = "checking" | "ok" | "mismatch" | "invalid";

interface SessionContextValue {
  ready: boolean;
  config: ConfigState;
  session: Session | null;
  profile: CachedProfile | null;
  /** Re-reads the profile (e.g. after setup completes). */
  refreshProfile: () => Promise<void>;
  /** Clears the local session after a forced sign-out. */
  forcedSignOut: (reason: "inactive" | "removed") => Promise<void>;
  lastForcedReason: "inactive" | "removed" | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadCachedProfile(userId: string): Promise<CachedProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    const cached = raw ? (JSON.parse(raw) as CachedProfile) : null;
    return cached?.userId === userId ? cached : null;
  } catch {
    return null;
  }
}

/**
 * Session + profile state for the auth gate. Works offline: the session comes from secure storage
 * and the profile from a local cache, refreshed from the server when reachable (FR-012).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // An invalid build has nothing to load: it is immediately ready to show the config-error screen.
  const [ready, setReady] = useState(!envResult.success);
  const [config, setConfig] = useState<ConfigState>(envResult.success ? "checking" : "invalid");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [lastForcedReason, setLastForcedReason] = useState<"inactive" | "removed" | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase()
      .from("profiles")
      .select("role, setup_completed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return; // offline or transient — keep the cached profile
    if (!data) {
      // RLS hides the row from disabled/erased users (FR-015) — handled by forced sign-out.
      return;
    }
    const next: CachedProfile = { userId, role: data.role, setupComplete: data.setup_completed_at !== null };
    setProfile(next);
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const forcedSignOut = useCallback(async (reason: "inactive" | "removed") => {
    const userId = (await supabase().auth.getSession()).data.session?.user.id;
    await supabase().auth.signOut({ scope: "local" }).catch(() => undefined);
    if (userId && reason === "removed") await localData.wipeAll(userId);
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY).catch(() => undefined);
    setProfile(null);
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
      .then(({ data }) => {
        const env = (data as { environment?: string } | null)?.environment;
        setConfig(env && env !== expectedEnv ? "mismatch" : "ok");
      }, () => setConfig("ok")); // offline: keep working from the local session

    client.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        setProfile(await loadCachedProfile(data.session.user.id));
        void fetchProfile(data.session.user.id);
      }
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void fetchProfile(next.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchProfile, forcedSignOut]);

  const refreshProfile = useCallback(async () => {
    if (session) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const value = useMemo(
    () => ({ ready, config, session, profile, refreshProfile, forcedSignOut, lastForcedReason }),
    [ready, config, session, profile, refreshProfile, forcedSignOut, lastForcedReason],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
