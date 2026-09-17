import Foundation
import UIKit

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
    progressListener = progress
    finishListener = finish
    failureListener = failure
    _ = ensureSession()
  }

  /// JS 侧不再监听时清空回调（避免事件发到已经销毁的 JS runtime）
  func clearListeners() {
    progressListener = nil
    finishListener = nil
    failureListener = nil
  }

  /// 启动一个分片下载作业：所有分片一次性入队，立刻返回
  @discardableResult
  func start(job: Job) -> Bool {
    guard !job.urls.isEmpty else { return false }
    jobs[job.id] = job
    persistJobs()

    let partsDirectory = URL(fileURLWithPath: job.partsDirectory, isDirectory: true)
    try? FileManager.default.createDirectory(at: partsDirectory, withIntermediateDirectories: true)

    let session = ensureSession()
    // 已经在队列里的同作业任务先撤掉，避免重复下载
    cancelTasks(for: job.id, in: session, removeParts: true)

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

  /// 未完成的作业（JS 启动时对账用）
  func pendingJobs() -> [[String: Any]] {
    let session = ensureSession()
    let outstanding = sessionTasksByJob(in: session)
    return jobs.values.map { job in
      let parts = existingParts(of: job)
      return [
        "id": job.id,
        "destination": job.destination,
        "completed": parts.count,
        "total": job.urls.count,
        "outstanding": outstanding[job.id] ?? 0
      ]
    }
  }

  /// 分片都在就立刻拼接（对账路径：App 被杀期间系统把分片下完了）
  @discardableResult
  func assembleIfComplete(jobId: String) -> Bool {
    guard let job = jobs[jobId] else { return false }
    guard existingParts(of: job).count == job.urls.count else { return false }
    assemble(job: job)
    return true
  }

  /// 把所有分片已齐的作业就地拼装（App 被系统唤醒、或下次启动对账时调用）
  @discardableResult
  func assembleCompletedJobs() -> Int {
    var assembled = 0
    for job in jobs.values where existingParts(of: job).count == job.urls.count {
      assemble(job: job)
      assembled += 1
    }
    return assembled
  }

  func cancel(jobId: String) {
    let session = ensureSession()
    cancelTasks(for: jobId, in: session, removeParts: true)
    if let job = jobs[jobId] {
      try? FileManager.default.removeItem(atPath: job.partsDirectory)
    }
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

  private func sessionTasksByJob(in session: URLSession) -> [String: Int] {
    var counts: [String: Int] = [:]
    let semaphore = DispatchSemaphore(value: 0)
    session.getAllTasks { tasks in
      for task in tasks {
        guard let description = task.taskDescription,
              let jobId = description.split(separator: "|").first else { continue }
        counts[String(jobId), default: 0] += 1
      }
      semaphore.signal()
    }
    // getAllTasks 的回调在 session 队列上；这里等一小会儿即可，纯内存统计
    _ = semaphore.wait(timeout: .now() + 2)
    return counts
  }

  private func cancelTasks(for jobId: String, in session: URLSession, removeParts: Bool) {
    let semaphore = DispatchSemaphore(value: 0)
    session.getAllTasks { tasks in
      for task in tasks where task.taskDescription?.hasPrefix("\(jobId)|") == true {
        task.cancel()
      }
      semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 2)
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
    let parts = existingParts(of: job)
    guard parts.count == job.urls.count else { return }

    let destination = URL(fileURLWithPath: job.destination)
    try? FileManager.default.createDirectory(
      at: destination.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    let partial = URL(fileURLWithPath: job.destination + ".part")
    FileManager.default.createFile(atPath: partial.path, contents: nil)

    guard let handle = try? FileHandle(forWritingTo: partial) else {
      failureListener?(JobFailure(id: job.id, reason: "无法写入成品文件"))
      return
    }

    do {
      for index in parts {
        let data = try Data(contentsOf: partURL(job: job, index: index))
        try handle.write(contentsOf: data)
      }
      try handle.close()
      if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: destination)
      }
      try FileManager.default.moveItem(at: partial, to: destination)
      let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
      let bytes = (attributes?[.size] as? Int) ?? 0
      finishListener?(JobFinished(id: job.id, destination: job.destination, bytes: bytes))
    } catch {
      try? handle.close()
      try? FileManager.default.removeItem(at: partial)
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

  private func persistJobs() {
    guard let data = try? JSONEncoder().encode(jobs) else { return }
    try? data.write(to: jobsFileURL, options: .atomic)
  }

  // MARK: - URLSessionDownloadDelegate

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let description = downloadTask.taskDescription,
          let indexString = description.split(separator: "|").last,
          let index = Int(indexString),
          let rawJobId = description.split(separator: "|").first,
          let job = jobs[String(rawJobId)] else { return }

    let target = partURL(job: job, index: index)
    // 这个回调返回后系统就会删掉 location，必须同步搬走
    try? FileManager.default.removeItem(at: target)
    do {
      try FileManager.default.moveItem(at: location, to: target)
    } catch {
      // 搬不动就当作这一片失败：不写 .part，下次对账时会重下整个作业
    }
    emitProgress(for: job.id)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let description = task.taskDescription,
          let rawJobId = description.split(separator: "|").first,
          let job = jobs[String(rawJobId)] else { return }

    if let error, (error as NSError).code != NSURLErrorCancelled {
      failureListener?(JobFailure(id: job.id, reason: error.localizedDescription))
      return
    }

    let parts = existingParts(of: job)
    emitProgress(for: job.id)
    if parts.count == job.urls.count {
      assemble(job: job)
    }
  }

  /// 后台事件处理完：把 AppDelegate 收下的 completionHandler 交回去，系统据此决定何时挂起 App
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    AudioDownloaderBackgroundHandler.shared.invokeCompletionHandler(forSessionIdentifier: Self.sessionIdentifier)
  }
}
