import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/** A connectivity change must hold this long before the indicator follows it (FR-036: ≤ 5 s). */
export const OFFLINE_DEBOUNCE_MS = 2000;

/** Offline means no network, or a network Android has confirmed has no internet. Unknown is not offline. */
export function isOfflineState(state: Pick<NetInfoState, "isConnected" | "isInternetReachable">): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * Whether the phone is offline; `null` until the first reading. The first reading applies at once;
 * later changes are debounced so that brief drops (lifts, tunnels, Wi-Fi hand-over) do not flash
 * the banner.
 */
export function useOffline(debounceMs = OFFLINE_DEBOUNCE_MS): boolean | null {
  const [offline, setOffline] = useState<boolean | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const next = isOfflineState(state);
      if (timer) clearTimeout(timer);
      if (first) {
        first = false;
        setOffline(next);
      } else {
        timer = setTimeout(() => setOffline(next), debounceMs);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [debounceMs]);

  return offline;
}
