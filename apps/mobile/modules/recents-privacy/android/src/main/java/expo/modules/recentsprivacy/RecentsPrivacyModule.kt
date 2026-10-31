package expo.modules.recentsprivacy

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Hides the app's preview in the recent-apps screen while app lock is on (R1 T110, FR-027).
 * Uses Activity.setRecentsScreenshotEnabled (Android 13, API 33+), which affects only the recents
 * thumbnail: screenshots taken by the user stay allowed (unlike FLAG_SECURE).
 */
class RecentsPrivacyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecentsPrivacy")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    }

    Function("setHidden") { hidden: Boolean ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val activity = appContext.currentActivity ?: return@Function false
        activity.runOnUiThread { activity.setRecentsScreenshotEnabled(!hidden) }
        true
      } else {
        false
      }
    }
  }
}
