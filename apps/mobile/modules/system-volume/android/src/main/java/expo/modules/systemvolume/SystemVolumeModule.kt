package expo.modules.systemvolume

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

/**
 * Android 侧的系统媒体音量（与 iOS 的 SystemVolumeModule 同一份 JS 契约）。
 *
 * 与 iOS 的两点关键差异：
 * 1. iOS 只有通过 MPVolumeView 才能「静默」改音量（否则弹系统音量 HUD）；Android 直接
 *    调 `AudioManager.setStreamVolume(..., flags = 0)` 就不会弹 HUD，不需要幽灵视图，
 *    所以 JS 侧的 `SystemVolumeSlider` 在 Android 上渲染 null。
 * 2. Android 没有官方的音量变化回调，只能监听系统广播 `android.media.VOLUME_CHANGED_ACTION`
 *    （隐藏常量，这里用字面值）。
 *
 * 音量统一归一化到 0..1，和 iOS 的 `AVAudioSession.outputVolume` 语义保持一致，
 * 这样上层音量条的逻辑两端可以共用。
 */
class SystemVolumeModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    OnStartObserving("onVolumeChange") { startListening() }
    OnStopObserving("onVolumeChange") { stopListening() }

    Function("getSystemVolume") { currentVolume() }

    AsyncFunction("setSystemVolume") { volume: Double ->
      setVolume(volume)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React Application Context is null" }

  private val audioManager: AudioManager
    get() = requireNotNull(context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager) {
      "AudioManager 不可用"
    }

  private fun maxVolume(): Int = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)

  /** 归一化到 0..1 */
  private fun currentVolume(): Double {
    val max = maxVolume()
    if (max <= 0) return 0.0
    return audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
  }

  private fun setVolume(volume: Double) {
    val max = maxVolume()
    if (max <= 0) return
    val target = (volume.coerceIn(0.0, 1.0) * max).roundToInt().coerceIn(0, max)
    // flags 传 0：不显示系统音量 HUD，对齐 iOS 用 MPVolumeView 静默改音量的效果
    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
  }

  private fun startListening() {
    if (receiver != null) return
    val filter = IntentFilter(VOLUME_CHANGED_ACTION)
    val listener = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        // 广播对每个音轨都会发一次，只关心媒体音量那一条
        if (intent?.getIntExtra(EXTRA_VOLUME_STREAM_TYPE, -1) != AudioManager.STREAM_MUSIC) return
        sendEvent("onVolumeChange", mapOf("volume" to currentVolume()))
      }
    }
    try {
      // Android 13+ 注册非系统广播必须声明是否导出；这里只收系统广播，用 NOT_EXPORTED
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(listener, filter)
      }
      receiver = listener
    } catch (error: Exception) {
      // 注册失败（权限或系统限制）时静默降级：音量条仍可读写，只是不跟随系统按键
      receiver = null
    }
  }

  private fun stopListening() {
    val listener = receiver ?: return
    receiver = null
    try {
      context.unregisterReceiver(listener)
    } catch (_: IllegalArgumentException) {
      // 没注册成功过，忽略
    }
  }

  private companion object {
    /** AudioManager.VOLUME_CHANGED_ACTION 的字面值（该常量为 hidden，不能直接引用） */
    const val VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION"

    /** AudioManager.EXTRA_VOLUME_STREAM_TYPE 的字面值 */
    const val EXTRA_VOLUME_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"
  }
}
