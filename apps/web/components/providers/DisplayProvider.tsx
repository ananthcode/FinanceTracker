"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_PREFERENCES, type Preferences } from "@ft/core";

const HIDE_KEY = "ft.hideBalances";
const HIDE_EVENT = "ft:hide-balances";

interface DisplayContextValue {
  preferences: Preferences;
  hideBalances: boolean;
  setHideBalances: (on: boolean) => void;
}

const DisplayContext = createContext<DisplayContextValue>({
  preferences: DEFAULT_PREFERENCES,
  hideBalances: false,
  setHideBalances: () => {},
});

function readHide(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false; // storage unavailable (private mode)
  }
}

/** Re-renders on changes from this tab (custom event) and other tabs (storage event). */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(HIDE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HIDE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Display settings for every amount and date: the user's preferences (filled in by US3) and the
 * per-device hide-balances flag stored in this browser only (FR-031–FR-033).
 */
export function DisplayProvider({
  preferences = DEFAULT_PREFERENCES,
  children,
}: {
  preferences?: Preferences;
  children: ReactNode;
}) {
  // Server render: off; browser: this device's saved choice.
  const hideBalances = useSyncExternalStore(subscribe, readHide, () => false);

  const setHideBalances = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(HIDE_KEY, on ? "1" : "0");
    } catch {
      // ignore — the toggle still applies until reload
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
  }, []);

  const value = useMemo(() => ({ preferences, hideBalances, setHideBalances }), [preferences, hideBalances, setHideBalances]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): DisplayContextValue {
  return useContext(DisplayContext);
}
