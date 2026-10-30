package expo.modules.stepcounter

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class StepCounterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("StepCounter")

    Function("isSupported") {
      val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    Function("isEnabled") { StepStore(context).enabled }

    Function("readAll") { StepStore(context).readAll() }

    // Called from the screen, so the app is in the foreground as Android requires.
    Function("start") {
      StepStore(context).enabled = true
      ContextCompat.startForegroundService(context, Intent(context, StepService::class.java))
      Unit
    }

    Function("stop") {
      StepStore(context).enabled = false
      context.stopService(Intent(context, StepService::class.java))
      Unit
    }

    // The standard share sheet with a picture and a message together, which expo-sharing can't do.
    Function("shareImage") { uri: String, text: String, title: String ->
      val path = Uri.parse(uri).path ?: uri
      val shared = FileProvider.getUriForFile(context, "${context.packageName}.stepcounter.share", File(path))
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, shared)
        putExtra(Intent.EXTRA_TEXT, text)
        clipData = ClipData.newRawUri(null, shared)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, title).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.startActivity(chooser)
      Unit
    }
  }
}
