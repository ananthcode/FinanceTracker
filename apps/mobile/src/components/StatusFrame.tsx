import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useOffline } from "@/lib/connectivity";
import { checkService, useServiceUnavailable } from "@/lib/service-status";
import { DemoBadge } from "./DemoBadge";
import { OfflineBanner } from "./OfflineBanner";
import { ServiceUnavailable } from "./ServiceUnavailable";

/**
 * Status strip above every screen: Demo marker (FR-035, signed-in screens only), Offline banner
 * (FR-036) and "service temporarily unavailable" (T104). When the strip shows, it takes the
 * status-bar inset itself and the screens below are told there is none, so headers are not
 * padded twice.
 */
export function StatusFrame({
  demo,
  check = checkService,
  children,
}: {
  demo: boolean;
  check?: () => Promise<boolean>;
  children: ReactNode;
}) {
  const connectivity = useOffline(); // null until the first reading
  const offline = connectivity === true;
  const { unavailable, recheck } = useServiceUnavailable(connectivity === false, check);
  const insets = useSafeAreaInsets();
  const visible = demo || offline || unavailable;

  return (
    <View style={{ flex: 1 }}>
      {visible && (
        <View style={{ paddingTop: insets.top, backgroundColor: "#24292f" }}>
          {demo && <DemoBadge />}
          {offline && <OfflineBanner />}
          {unavailable && <ServiceUnavailable onRetry={() => void recheck()} />}
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={visible ? { ...insets, top: 0 } : insets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
