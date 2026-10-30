package expo.modules.stepcounter

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Starts counting again after the phone restarts or the app is updated, if it was on. */
class StepBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (!StepStore(context).enabled) return
    try {
      ContextCompat.startForegroundService(context, Intent(context, StepService::class.java))
    } catch (e: Exception) {
      // Android refused the start. Opening the app starts it again.
    }
  }
}
