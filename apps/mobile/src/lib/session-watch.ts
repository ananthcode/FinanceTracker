import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Forced sign-out on Android (T096, FR-015, SC-007): whenever the app returns to the foreground,
 * re-check /api/me. `api()` turns `USER_INACTIVE` into a sign-out and an unknown (erased) user into
 * a sign-out plus `LocalDataStore.wipeAll`, so the check itself is all that is needed here.
 */
export function useSessionWatch(signedIn: boolean, check: () => Promise<void>): void {
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  useEffect(() => {
    if (!signedIn) return;
    let last = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && last !== "active") void checkRef.current();
      last = next;
    });
    return () => sub.remove();
  }, [signedIn]);
}
