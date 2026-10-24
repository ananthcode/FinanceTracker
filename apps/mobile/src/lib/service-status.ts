import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

/** While the service is down it is checked again this often. */
export const SERVICE_RECHECK_MS = 60_000;

/** True when the backend answers its health check (app.health). */
export async function checkService(): Promise<boolean> {
  try {
    const { data, error } = await supabase().schema("app").rpc("health");
    return !error && data !== null;
  } catch {
    return false;
  }
}

/**
 * Whether the backend is unreachable or paused while the phone itself is online (spec Edge Cases).
 * Checked once the phone is known to be online, when the app returns to the foreground, and
 * periodically while it is down. `online` is false while offline or not yet known; offline is
 * reported by the offline banner instead.
 */
export function useServiceUnavailable(online: boolean, check: () => Promise<boolean> = checkService) {
  const [unavailable, setUnavailable] = useState(false);
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  const recheck = useCallback(async () => {
    const ok = await checkRef.current();
    setUnavailable(!ok);
  }, []);

  useEffect(() => {
    if (!online) return;
    void recheck();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void recheck();
    });
    return () => sub.remove();
  }, [online, recheck]);

  useEffect(() => {
    if (!online || !unavailable) return;
    const timer = setInterval(() => void recheck(), SERVICE_RECHECK_MS);
    return () => clearInterval(timer);
  }, [online, unavailable, recheck]);

  return { unavailable: unavailable && online, recheck };
}
