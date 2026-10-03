import Foundation
import UIKit

// swiftlint:disable type_body_length
/**
 * 后台分片下载会话。
 *
 * ── 为什么需要原生 ──────────────────────────────────────────────────────────
 * 「转码曲目」的产物是一条 HLS 播放列表：`init.mp4` + N 个分片，要**按序**取回再拼成一个文件。
 * JS 侧做这件事（`player/transcode-cache.ts`）在 App 挂起时会被冻结 —— 一进后台就停。
 * 所以把「取分片 + 拼接」搬到原生，用 iOS 的**后台 URLSession**：
 * 任务交给系统的 `nsurlsessiond`，App 挂起甚至被杀死后传输仍继续，
 * 全部到齐后在后台（或被唤醒时）拼成成品文件。
 *
 * ── 关键实现选择 ────────────────────────────────────────────────────────────
 * 1. **所有分片一次性入队**（不是下完一个再排下一个）：只有把任务交给系统，
 *    App 被挂起时才会继续；顺序由文件名里的序号保证，完成顺序无所谓。
 * 2. session 标识固定，且 `sessionSendsLaunchEvents = true` —— App 被系统为
 *    后台事件唤醒时会重用同一个 session（`getAllTasks` 能重新看到未完成任务）。
 * 3. 任务与作业的对应关系写在 `taskDescription`（`jobId|index`），**随系统任务一起持久化**，
 *    所以 App 重启后仍能重建映射，不必自己维护 taskIdentifier。
 * 4. 作业状态另存一份 JSON（分片目录 + 目标路径 + 头），供启动时对账。
 */
final class AudioDownloaderSession: NSObject, URLSessionDownloadDelegate {
  static let shared = AudioDownloaderSession()

  /// 分片与作业状态的落盘位置（Library 目录，不进 iCloud 备份无所谓，但别放 tmp）
  private let storeDirectory: URL = {
    let base = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    let dir = base.appendingPathComponent("audio-downloader", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }()

  private var jobsFileURL: URL { storeDirectory.appendingPathComponent("jobs.json") }
  private var jobs: [String: Job] = [:]
  private let stateQueue = DispatchQueue(label: "com.chrisli.music.audio-downloader.state")
  private var session: URLSession?
  private var progressListener: ((JobProgress) -> Void)?
  private var finishListener: ((JobFinished) -> Void)?
  private var failureListener: ((JobFailure) -> Void)?

  struct Job: Codable {
    let id: String
    let urls: [String]
    let headers: [String: String]
    /// 成品文件的绝对路径
    let destination: String
    /// 分片临时目录的绝对路径
    let partsDirectory: String
  }

  struct JobProgress {
    let id: String
    let completed: Int
    let total: Int
  }

  struct JobFinished {
    let id: String
    let destination: String
    let bytes: Int
  }

  struct JobFailure {
    let id: String
    let reason: String
  }

  private static let sessionIdentifier = "com.chrisli.music.audio-download"

  private override init() {
    super.init()
    loadJobs()
  }

  // MARK: - 对外接口

  func setListeners(
    progress: @escaping (JobProgress) -> Void,
    finish: @escaping (JobFinished) -> Void,
    failure: @escaping (JobFailure) -> Void
  ) {
    stateQueue.sync {
      progressListener = progress
      finishListener = finish
      failureListener = failure
      _ = ensureSession()
    }
  }

  /// JS 侧不再监听时清空回调（避免事件发到已经销毁的 JS runtime）
  func clearListeners() {
    stateQueue.sync {
      progressListener = nil
      finishListener = nil
      failureListener = nil
    }
  }

  /// 启动一个分片下载作业：所有分片一次性入队，立刻返回
  @discardableResult
  func start(job: Job) -> Bool {
    stateQueue.sync { startLocked(job: job) }
  }

  private func startLocked(job: Job) -> Bool {
    guard !job.urls.isEmpty, job.urls.allSatisfy({ URL(string: $0) != nil }) else { return false }
    let session = ensureSession()
    // The native id is a unique attempt id, so old tasks cannot share this job state.
    jobs[job.id] = job
    guard persistJobs() else {
      jobs.removeValue(forKey: job.id)
      return false
    }
    let partsDirectory = URL(fileURLWithPath: job.partsDirectory, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: partsDirectory, withIntermediateDirectories: true)
    } catch {
      jobs.removeValue(forKey: job.id)
      _ = persistJobs()
      return false
    }

    for (index, urlString) in job.urls.enumerated() {
      guard let url = URL(string: urlString) else { continue }
      var request = URLRequest(url: url)
      for (key, value) in job.headers {
        request.setValue(value, forHTTPHeaderField: key)
      }
      let task = session.downloadTask(with: request)
      // 作业与序号的对应关系放进 taskDescription：它随系统任务一起持久化
      task.taskDescription = "\(job.id)|\(index)"
      task.resume()
    }

    emitProgress(for: job.id)
    return true
  }

  /// 未完成作业：getAllTasks 异步回调避免在状态队列等待 delegate 队列。
  func pendingJobs(completion: @escaping ([[String: Any]]) -> Void) {
    let (session, queriedJobIds) = stateQueue.sync { (ensureSession(), Set(jobs.keys)) }
    session.getAllTasks { [weak self] tasks in
      guard let self else { return }
      let activeIds = Set(tasks.compactMap { task -> String? in
        guard let description = task.taskDescription,
              let jobId = description.split(separator: "|").first else { return nil }
        return String(jobId)
      })
      self.stateQueue.async {
        let snapshot = self.jobs.values.map { job -> [String: Any] in
          let parts = self.existingParts(of: job)
          let status: String
          if parts.count == job.urls.count {
            status = "completed"
          } else if !queriedJobIds.contains(job.id) || activeIds.contains(job.id) {
            status = "pending"
          } else {
            status = "failed"
          }
          let outstanding = max(job.urls.count - parts.count, 0)
          return [
            "id": job.id,
            "destination": job.destination,
            "completed": parts.count,
            "total": job.urls.count,
            "outstanding": outstanding,
            "status": status,
            "error": status == "failed" ? "后台下载任务已停止" : ""
          ]
        }
        completion(snapshot)
      }
    }
  }

  /// 分片都在就立刻拼接（对账路径：App 被杀期间系统把分片下完了）
  @discardableResult
  func assembleIfComplete(jobId: String) -> Bool {
    stateQueue.sync { assembleIfCompleteLocked(jobId: jobId) }
  }

  private func assembleIfCompleteLocked(jobId: String) -> Bool {
    guard let job = jobs[jobId] else { return false }
    guard existingParts(of: job).count == job.urls.count else { return false }
    assemble(job: job)
    return true
  }

  /// 把所有分片已齐的作业就地拼装（App 被系统唤醒、或下次启动对账时调用）
  @discardableResult
  func assembleCompletedJobs() -> Int {
    stateQueue.sync { assembleCompletedJobsLocked() }
  }

  private func assembleCompletedJobsLocked() -> Int {
    var assembled = 0
    for job in jobs.values where existingParts(of: job).count == job.urls.count {
      assemble(job: job)
      assembled += 1
    }
    return assembled
  }

  func cancel(jobId: String) {
    stateQueue.sync { cancelLocked(jobId: jobId) }
  }

  private func cancelLocked(jobId: String) {
    let session = ensureSession()
    cancelTasks(for: jobId, in: session, removeParts: true)
    jobs.removeValue(forKey: jobId)
    persistJobs()
  }

  // MARK: - 内部

  private func ensureSession() -> URLSession {
    if let session { return session }
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    // 分片按序拼，并发太高反而抢带宽影响正在播放的音频
    configuration.httpMaximumConnectionsPerHost = 2
    let created = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    session = created
    return created
  }

  private func cancelTasks(for jobId: String, in session: URLSession, removeParts: Bool) {
    session.getAllTasks { tasks in
      for task in tasks where task.taskDescription?.hasPrefix("\(jobId)|") == true {
        task.cancel()
      }
    }
    if removeParts, let job = jobs[jobId] {
      try? FileManager.default.removeItem(atPath: job.partsDirectory)
    }
  }

  private func partURL(job: Job, index: Int) -> URL {
    URL(fileURLWithPath: job.partsDirectory, isDirectory: true)
      .appendingPathComponent(String(format: "%04d.part", index))
  }

  /// 已落盘的分片下标（对账与拼接都以磁盘为准）
  private func existingParts(of job: Job) -> [Int] {
    let directory = URL(fileURLWithPath: job.partsDirectory, isDirectory: true)
    guard let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return [] }
    return names.compactMap { name -> Int? in
      guard name.hasSuffix(".part") else { return nil }
      return Int(name.replacingOccurrences(of: ".part", with: ""))
    }.sorted()
  }

  private func emitProgress(for jobId: String) {
    guard let job = jobs[jobId] else { return }
    progressListener?(JobProgress(id: jobId, completed: existingParts(of: job).count, total: job.urls.count))
  }

  /// 按序号把所有分片拼成成品文件（fMP4 的 init + 分片顺序拼接即合法文件）
  private func assemble(job: Job) {
    let destination = URL(fileURLWithPath: job.destination)
    let partsDirectory = URL(fileURLWithPath: job.partsDirectory, isDirectory: true)
    do {
      let bytes = try AudioDownloaderFileAssembler.assemble(
        urls: job.urls,
        destination: destination,
        partsDirectory: partsDirectory
      )
      finishListener?(JobFinished(id: job.id, destination: job.destination, bytes: bytes))
    } catch {
      try? FileManager.default.removeItem(atPath: job.destination + ".part")
      failureListener?(JobFailure(id: job.id, reason: error.localizedDescription))
      return
    }

    // 拼完就清掉分片与作业状态：成品文件本身就是「下载完成」的唯一凭据
    try? FileManager.default.removeItem(atPath: job.partsDirectory)
    jobs.removeValue(forKey: job.id)
    persistJobs()
  }

  private func loadJobs() {
    guard let data = try? Data(contentsOf: jobsFileURL),
          let decoded = try? JSONDecoder().decode([String: Job].self, from: data) else { return }
    jobs = decoded
  }

  @discardableResult
  private func persistJobs() -> Bool {
    guard let data = try? JSONEncoder().encode(jobs) else { return false }
    do {
      try data.write(to: jobsFileURL, options: .atomic)
      return true
    } catch {
      return false
    }
  }

  // MARK: - URLSessionDownloadDelegate

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    stateQueue.sync {
    guard let description = downloadTask.taskDescription,
          let indexString = description.split(separator: "|").last,
          let index = Int(indexString),
          let rawJobId = description.split(separator: "|").first,
          let job = jobs[String(rawJobId)] else { return }

    if let response = downloadTask.response as? HTTPURLResponse,
       !(200..<300).contains(response.statusCode) {
      try? FileManager.default.removeItem(at: location)
      fail(job: job, reason: "分片 HTTP \(response.statusCode)")
      return
    }

    let target = partURL(job: job, index: index)
    // 这个回调返回后系统就会删掉 location，必须同步搬走
    try? FileManager.default.removeItem(at: target)
    do {
      try FileManager.default.moveItem(at: location, to: target)
    } catch {
      // 搬不动就当作这一片失败：不写 .part，下次对账时会重下整个作业
      fail(job: job, reason: "无法保存下载分片")
    }
    emitProgress(for: job.id)
    }
  }

  private func fail(job: Job, reason: String) {
    try? FileManager.default.removeItem(atPath: job.partsDirectory)
    jobs.removeValue(forKey: job.id)
    persistJobs()
    failureListener?(JobFailure(id: job.id, reason: reason))
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    stateQueue.sync {
    guard let description = task.taskDescription,
          let rawJobId = description.split(separator: "|").first,
          let job = jobs[String(rawJobId)] else { return }

    if let error, (error as NSError).code != NSURLErrorCancelled {
      fail(job: job, reason: error.localizedDescription)
      return
    }

    let parts = existingParts(of: job)
    emitProgress(for: job.id)
    if parts.count == job.urls.count {
      assemble(job: job)
    }
    }
  }

  /// 后台事件处理完：把 AppDelegate 收下的 completionHandler 交回去，系统据此决定何时挂起 App
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    AudioDownloaderBackgroundHandler.shared.invokeCompletionHandler(forSessionIdentifier: Self.sessionIdentifier)
  }
}
// swiftlint:enable type_body_length
