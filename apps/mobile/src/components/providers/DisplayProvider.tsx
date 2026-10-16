import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PREFERENCES, type Preferences } from "@ft/core";

const HIDE_KEY = "ft.hideBalances";

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

/**
 * Display settings for every amount and date on Android: the user's preferences (filled by US3)
 * and the per-device hide-balances flag (FR-031–FR-033), kept on this phone only.
 */
export function DisplayProvider({
  preferences = DEFAULT_PREFERENCES,
  children,
}: {
  preferences?: Preferences;
  children: ReactNode;
}) {
  const [hideBalances, setHide] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_KEY)
      .then((v) => setHide(v === "1"))
      .catch(() => undefined);
  }, []);

  const setHideBalances = useCallback((on: boolean) => {
    setHide(on);
    AsyncStorage.setItem(HIDE_KEY, on ? "1" : "0").catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ preferences, hideBalances, setHideBalances }), [preferences, hideBalances, setHideBalances]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): DisplayContextValue {
  return useContext(DisplayContext);
}
