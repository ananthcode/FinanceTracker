/**
 * Recent-apps preview while app lock is on (R1 T110, FR-027). Android 13+: the native
 * RecentsPrivacy module hides the thumbnail; older Android: PrivacyOverlay covers the screen while
 * the app is in the background (best effort). Screenshots stay allowed either way.
 */
import { requireOptionalNativeModule } from "expo";

interface RecentsPrivacyNative {
  isSupported(): boolean;
  setHidden(hidden: boolean): boolean;
}

const native = requireOptionalNativeModule<RecentsPrivacyNative>("RecentsPrivacy");

/** True when the system can hide the preview itself (Android 13+ with the native module). */
export function recentsPreviewSupported(): boolean {
  return native?.isSupported() ?? false;
}

export async function setRecentsPreviewHidden(hidden: boolean): Promise<void> {
  native?.setHidden(hidden);
}
