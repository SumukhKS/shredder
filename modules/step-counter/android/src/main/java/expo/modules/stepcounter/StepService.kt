package expo.modules.stepcounter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.text.NumberFormat

/** Reads the hardware step counter while the app is closed, with the live notification Android requires. */
class StepService : Service(), SensorEventListener {
  private lateinit var store: StepStore
  private var sensors: SensorManager? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = StepStore(this)
    createChannel()
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(store.today()), ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
    } catch (e: Exception) {
      // Permission taken away, or Android refused the start. Nothing to count with, so stop quietly.
      stopSelf()
      return
    }
    val manager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensor = manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    if (sensor == null) {
      stopSelf()
      return
    }
    sensors = manager
    // Steps can arrive in batches a minute apart, which lets the phone sleep in between.
    manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL, BATCH_MICROS)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

  override fun onDestroy() {
    sensors?.unregisterListener(this)
    super.onDestroy()
  }

  override fun onSensorChanged(event: SensorEvent) {
    store.record(event.values[0].toLong())
    getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification(store.today()))
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Step tracking", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  private fun notification(steps: Int): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val tap = open?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE) }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_directions)
      .setContentTitle("Tracking steps")
      .setContentText("${NumberFormat.getIntegerInstance().format(steps)} steps today")
      .setContentIntent(tap)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .build()
  }

  private companion object {
    const val CHANNEL_ID = "shredder-steps"
    const val NOTIFICATION_ID = 7301
    const val BATCH_MICROS = 60_000_000
  }
}
