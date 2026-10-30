package expo.modules.stepcounter

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Steps for each hour of each local day, kept on the phone. Only the service writes to it. */
internal class StepStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences("shredder_steps", Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = prefs.getBoolean("enabled", false)
    set(value) = prefs.edit().putBoolean("enabled", value).apply()

  /** All days as JSON: { "2026-10-30": [24 hourly counts] }. */
  fun readAll(): String = prefs.getString("days", "{}") ?: "{}"

  private fun dayKey(date: Date): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

  fun today(): Int {
    val hours = JSONObject(readAll()).optJSONArray(dayKey(Date())) ?: return 0
    var total = 0
    for (i in 0 until hours.length()) total += hours.optInt(i)
    return total
  }

  /** Takes the sensor's running total since the phone started, and books what's new to the current hour. */
  fun record(raw: Long) {
    val last = prefs.getLong("lastRaw", -1L)
    // The sensor restarts from zero when the phone reboots.
    val delta = when {
      last < 0L -> 0L
      raw < last -> raw
      else -> raw - last
    }
    val editor = prefs.edit().putLong("lastRaw", raw)
    if (delta > 0L) {
      val days = JSONObject(readAll())
      val now = Date()
      val key = dayKey(now)
      val hours = days.optJSONArray(key) ?: JSONArray().also { list -> repeat(24) { list.put(0) } }
      val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
      hours.put(hour, hours.optInt(hour) + delta.toInt())
      days.put(key, hours)
      prune(days)
      editor.putString("days", days.toString())
    }
    editor.apply()
  }

  // Forty days is plenty: anything older has long since been synced.
  private fun prune(days: JSONObject) {
    val cutoff = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -40) }.time
    val oldest = dayKey(cutoff)
    val stale = days.keys().asSequence().filter { it < oldest }.toList()
    stale.forEach { days.remove(it) }
  }
}
