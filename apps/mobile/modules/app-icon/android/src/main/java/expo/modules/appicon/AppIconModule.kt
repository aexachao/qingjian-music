package expo.modules.appicon

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val defaultIconId = "crimson-bars"
private val aliasSuffixes = linkedMapOf(
  "dark-bars" to "AppIconDarkBars",
  "gold-glow" to "AppIconGoldGlow",
  defaultIconId to "AppIconCrimsonBars"
)

class AppIconModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppIcon")

    AsyncFunction("supportsAlternateIcons") { true }

    AsyncFunction("getAppIcon") {
      val packageManager = context.packageManager
      aliasSuffixes.entries.firstOrNull { (iconId, suffix) ->
        when (packageManager.getComponentEnabledSetting(component(suffix))) {
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
          PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> iconId == defaultIconId
          else -> false
        }
      }?.key ?: defaultIconId
    }

    AsyncFunction("setAppIcon") { iconId: String ->
      val targetSuffix = aliasSuffixes[iconId] ?: throw InvalidAppIconException(iconId)
      val packageManager = context.packageManager
      val previousStates = aliasSuffixes.values.associateWith { suffix ->
        packageManager.getComponentEnabledSetting(component(suffix))
      }

      try {
        packageManager.setComponentEnabledSetting(
          component(targetSuffix),
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
          PackageManager.DONT_KILL_APP
        )
        aliasSuffixes.values.filter { it != targetSuffix }.forEach { suffix ->
          packageManager.setComponentEnabledSetting(
            component(suffix),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
          )
        }
      } catch (error: Exception) {
        previousStates.forEach { (suffix, state) ->
          packageManager.setComponentEnabledSetting(component(suffix), state, PackageManager.DONT_KILL_APP)
        }
        throw error
      }
    }
  }

  private val context
    get() = requireNotNull(appContext.reactContext) {
      "React Application Context is null"
    }

  private fun component(suffix: String) =
    ComponentName(context.packageName, "${context.packageName}.$suffix")
}

private class InvalidAppIconException(iconId: String) :
  CodedException("ERR_INVALID_APP_ICON", "未知应用图标：$iconId", null)
