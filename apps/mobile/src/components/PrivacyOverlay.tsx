import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { recentsPreviewSupported } from "@/lib/app-lock/recents-privacy";

/**
 * Older Android (below 13): cover the screen while the app is leaving the foreground, so the
 * recent-apps preview shows a blank screen rather than amounts (FR-027, best effort). On Android 13+
 * the system hides the preview itself and this renders nothing.
 */
export function PrivacyOverlay() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (recentsPreviewSupported()) return;
    const sub = AppState.addEventListener("change", (state) => setAway(state !== "active"));
    return () => sub.remove();
  }, []);
  if (!away) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "white", alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Finance Tracker</Text>
    </View>
  );
}
