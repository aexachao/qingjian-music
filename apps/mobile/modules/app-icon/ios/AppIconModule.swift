import ExpoModulesCore
import UIKit

private let defaultIconId = "crimson-glass"
private let alternateIconNames = [
  "dark-bars": "AppIconDarkBars",
  "gold-glow": "AppIconGoldGlow",
  "crimson-bars": "AppIconCrimsonBars"
]

public class AppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppIcon")

    AsyncFunction("supportsAlternateIcons") {
      UIApplication.shared.supportsAlternateIcons
    }.runOnQueue(.main)

    AsyncFunction("getAppIcon") { () -> String in
      guard let alternateName = UIApplication.shared.alternateIconName else {
        return defaultIconId
      }
      return alternateIconNames.first(where: { $0.value == alternateName })?.key ?? defaultIconId
    }.runOnQueue(.main)

    // Swift 5 的同步 closure 里不能用 withCheckedThrowingContinuation（async-only API）；
    // Expo 57 的 ConcurrentFunction 重载用了 sending 关键字，Swift 5 编译器不识别。
    // 所以用 DispatchGroup 在 Expo 后台线程上阻塞等主线程回调完成。
    // 刻意**不**加 .runOnQueue(.main)：否则 semaphore.wait() 会阻塞主线程、死锁。
    AsyncFunction("setAppIcon") { (iconId: String) in
      guard iconId == defaultIconId || alternateIconNames[iconId] != nil else {
        throw InvalidAppIconException(iconId)
      }
      guard UIApplication.shared.supportsAlternateIcons else {
        throw UnsupportedAppIconException()
      }

      let iconName = iconId == defaultIconId ? nil : alternateIconNames[iconId]
      let group = DispatchGroup()
      group.enter()
      var resultError: Error?

      DispatchQueue.main.async {
        UIApplication.shared.setAlternateIconName(iconName) { error in
          resultError = error
          group.leave()
        }
      }

      group.wait()

      if let error = resultError {
        throw error
      }
    }
  }
}

private class InvalidAppIconException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "未知应用图标：\(param)"
  }
}

private class UnsupportedAppIconException: Exception, @unchecked Sendable {
  override var reason: String {
    "当前设备不支持切换应用图标"
  }
}
