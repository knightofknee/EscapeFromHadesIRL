package expo.modules.usageevents

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Screen/keyguard history from UsageStatsManager, for phone-free nights.
 *
 * Exposes raw events only; pairing them into usage intervals happens in JS
 * (lib/phone-free.ts) where it is unit-tested. The system keeps these
 * events for only a few days, so the JS side snapshots each night promptly.
 */
class UsageEventsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("UsageEvents")

    Function("hasPermission") { hasUsageAccess() }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    AsyncFunction("queryScreenEvents") { startMs: Double, endMs: Double ->
      val out = ArrayList<Map<String, Any>>()
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || !hasUsageAccess()) return@AsyncFunction out
      val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = usm.queryEvents(startMs.toLong(), endMs.toLong())
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val type = when (event.eventType) {
          UsageEvents.Event.KEYGUARD_HIDDEN -> "unlock"
          UsageEvents.Event.KEYGUARD_SHOWN -> "lock"
          UsageEvents.Event.SCREEN_INTERACTIVE -> "screenOn"
          UsageEvents.Event.SCREEN_NON_INTERACTIVE -> "screenOff"
          else -> null
        } ?: continue
        out.add(mapOf("type" to type, "ts" to event.timeStamp.toDouble()))
      }
      out
    }
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
