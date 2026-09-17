import ExpoModulesCore

/**
 * 后台分片下载模块（JS 侧出口在 `modules/audio-downloader/index.ts`）。
 *
 * 只做一件事：**把一串 URL 按序下到一个文件**，且用系统后台会话，App 挂起/被杀都继续。
 * 「哪些分片、什么顺序、目标路径」由 JS 决定（播放列表解析在 `lib/hls-playlist.ts`），
 * 原生不碰 HLS 语义 —— 这样协议变化不用改原生代码。
 */
public class AudioDownloaderModule: Module {
  /// `partsDirectory` 由 JS 传：分片与成品都放在 App 自己的下载目录里，
  /// 用户删除下载时要能一并清掉，而不是散在 Native 的 Library 里。
  struct JobInput: Record {
    @Field var id: String = ""
    @Field var urls: [String] = []
    @Field var headers: [String: String] = [:]
    @Field var destination: String = ""
    @Field var partsDirectory: String = ""
  }

  public func definition() -> ModuleDefinition {
    Name("AudioDownloader")

    Events("onJobProgress", "onJobFinished", "onJobFailed")

    OnStartObserving {
      self.installListeners()
    }

    OnStopObserving {
      AudioDownloaderSession.shared.clearListeners()
    }

    /// 启动作业：所有分片一次性入队，立刻返回；进度与结果走事件
    AsyncFunction("startJob") { (input: JobInput) -> Bool in
      guard !input.id.isEmpty, !input.destination.isEmpty, !input.partsDirectory.isEmpty else {
        throw InvalidJobException()
      }
      return AudioDownloaderSession.shared.start(
        job: AudioDownloaderSession.Job(
          id: input.id,
          urls: input.urls,
          headers: input.headers,
          destination: input.destination,
          partsDirectory: input.partsDirectory
        )
      )
    }

    /// 未完成作业（JS 启动时对账：谁还在下、谁已经可以拼装了）
    AsyncFunction("pendingJobs") {
      AudioDownloaderSession.shared.pendingJobs()
    }

    /// 分片齐了就地拼装（对账路径用；返回是否真的拼了）
    AsyncFunction("assembleJob") { (jobId: String) -> Bool in
      AudioDownloaderSession.shared.assembleIfComplete(jobId: jobId)
    }

    AsyncFunction("cancelJob") { (jobId: String) in
      AudioDownloaderSession.shared.cancel(jobId: jobId)
    }

    /// 把所有已齐的作业拼装 —— App 被系统为后台事件唤醒时也会走这里
    AsyncFunction("assembleCompletedJobs") { () -> Int in
      AudioDownloaderSession.shared.assembleCompletedJobs()
    }
  }

  private func installListeners() {
    AudioDownloaderSession.shared.setListeners(
      progress: { [weak self] progress in
        self?.sendEvent("onJobProgress", [
          "id": progress.id,
          "completed": progress.completed,
          "total": progress.total
        ])
      },
      finish: { [weak self] finished in
        self?.sendEvent("onJobFinished", [
          "id": finished.id,
          "destination": finished.destination,
          "bytes": finished.bytes
        ])
      },
      failure: { [weak self] failure in
        self?.sendEvent("onJobFailed", [
          "id": failure.id,
          "reason": failure.reason
        ])
      }
    )
  }
}

internal final class InvalidJobException: Exception {
  override var reason: String {
    "后台下载作业缺少 id / destination / partsDirectory"
  }
}
