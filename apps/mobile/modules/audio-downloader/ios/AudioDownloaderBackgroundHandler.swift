import ExpoModulesCore
import UIKit

/**
 * AppDelegate 订阅者：接住「系统因为后台下载事件把 App 唤醒」的那次回调。
 *
 * 后台 URLSession 在 App 被杀之后仍会把分片下完；下完时系统会把 App 拉起来（不显示界面），
 * 并调用 `handleEventsForBackgroundURLSession`。我们必须：
 *   1. 把 completionHandler 存下来 —— 不存，系统收不到「处理完了」，会缩短 App 的存活时间；
 *   2. 等 `urlSessionDidFinishEvents` 时再交回去（由会话那边调用 `invokeCompletionHandler`）。
 *
 * 由 `expo-module.config.json` 的 `appDelegateSubscribers` 注册，不需要改 AppDelegate。
 */
public final class AudioDownloaderBackgroundHandler: ExpoAppDelegateSubscriber {
  public static let shared = AudioDownloaderBackgroundHandler()

  private var completionHandlers: [String: () -> Void] = [:]

  public func invokeCompletionHandler(forSessionIdentifier identifier: String) {
    guard let handler = completionHandlers[identifier] else { return }
    DispatchQueue.main.async { handler() }
    completionHandlers.removeValue(forKey: identifier)
  }

  #if os(iOS) || os(tvOS)
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    completionHandlers[identifier] = completionHandler
    // 系统可能是在 App 被杀之后把它拉起来的：这里顺手做一次对账，
    // 分片齐了就地拼装，免得等到用户下次打开 App 才出成品
    _ = AudioDownloaderSession.shared.assembleCompletedJobs()
  }
  #endif
}
