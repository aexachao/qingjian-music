package expo.modules.audiodownloader

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * Android 侧的后台下载会话（与 iOS 的 AudioDownloaderSession 同一份 JS 契约）。
 *
 * ── 与 iOS 的关键差异（别假装一致）──────────────────────────────────────────
 * iOS 用后台 URLSession，能把「一串分片按序下成一个文件」交给系统，App 挂起/被杀都续。
 * Android 这边用系统的 **DownloadManager**：它是系统级下载器，App 切后台、锁屏、甚至被杀
 * 都会继续下（这正是「直连原文件」要的真后台）。但 DownloadManager **一个任务只下一个 URL**，
 * 拼不了多分片 —— 所以：
 *   · **直连原文件**（urls 只有 1 个）→ 走 DownloadManager，真后台。
 *   · **转码分片**（urls 有多个）→ `start` 返回 false，让 JS 走前台拼接回退
 *     （转码本来就要 10 秒心跳、只能在 App 活着时下，见 player/downloads.ts）。
 *
 * DownloadManager 只能下到 app 专属外部目录（external files），下完再搬到 JS 指定的
 * 内部 destination（`Paths.document/downloads/...`）。搬运只在 App 进程活着时发生；
 * App 被杀期间下完的，靠启动时 `reconcile`（pendingJobs + assembleCompletedJobs）补搬。
 */
object AudioDownloaderSession {
  data class Job(
    val id: String,
    val urls: List<String>,
    val headers: Map<String, String>,
    val destination: String,
    val partsDirectory: String,
  )

  data class Progress(val id: String, val completed: Int, val total: Int)
  data class Finished(val id: String, val destination: String, val bytes: Long)
  data class Failure(val id: String, val reason: String)

  private var progressListener: ((Progress) -> Unit)? = null
  private var finishListener: ((Finished) -> Unit)? = null
  private var failureListener: ((Failure) -> Unit)? = null

  /** jobId -> 元数据（downloadId / 目标路径 / 临时路径） */
  private data class Pending(val downloadId: Long, val destination: String, val tempPath: String)

  private val store = mutableMapOf<String, Pending>()
  private var loaded = false
  private var receiver: BroadcastReceiver? = null
  private val completionExecutor = Executors.newSingleThreadExecutor()

  // ---- 对外接口 ----

  @Synchronized
  fun setListeners(
    context: Context,
    progress: (Progress) -> Unit,
    finish: (Finished) -> Unit,
    failure: (Failure) -> Unit,
  ) {
    progressListener = progress
    finishListener = finish
    failureListener = failure
    ensureLoaded(context)
    ensureReceiver(context)
  }

  @Synchronized
  fun clearListeners() {
    progressListener = null
    finishListener = null
    failureListener = null
  }

  /**
   * 启动一个下载作业。
   * urls 只有一个（直连）→ 交给 DownloadManager，返回 true；
   * urls 有多个（转码分片）→ 返回 false，让 JS 走前台拼接。
   */
  @Synchronized
  fun start(context: Context, job: Job): Boolean {
    if (job.urls.size != 1) return false
    ensureLoaded(context)
    ensureReceiver(context)

    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager ?: return false
    // 已经在下的同作业先撤掉，避免重复
    store[job.id]?.let { manager.remove(it.downloadId) }

    val tempDir = File(context.getExternalFilesDir(null), "audio-downloader")
    if (!tempDir.exists()) tempDir.mkdirs()
    val tempFile = File(tempDir, "${sanitize(job.id)}.part")
    if (tempFile.exists()) tempFile.delete()

    val request = DownloadManager.Request(Uri.parse(job.urls[0])).apply {
      for ((key, value) in job.headers) addRequestHeader(key, value)
      setDestinationUri(Uri.fromFile(tempFile))
      setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
      setAllowedOverMetered(true)
      setAllowedOverRoaming(true)
    }

    val downloadId = try {
      manager.enqueue(request)
    } catch (error: Exception) {
      throw error
    }

    store[job.id] = Pending(downloadId, job.destination, tempFile.absolutePath)
    if (!persist(context)) {
      manager.remove(downloadId)
      store.remove(job.id)
      throw IllegalStateException("无法保存下载任务记录")
    }
    progressListener?.invoke(Progress(job.id, 0, 1))
    return true
  }

  /** 未完成作业（JS 启动时对账用） */
  @Synchronized
  fun pendingJobs(context: Context): List<Map<String, Any>> {
    ensureLoaded(context)
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
    return store.map { (id, pending) ->
      val status = manager?.let { queryStatus(it, pending.downloadId) } ?: DownloadManager.STATUS_PENDING
      val completed = if (status == DownloadManager.STATUS_SUCCESSFUL) 1 else 0
      // outstanding：系统队列里还没下完的任务数（1 = 还在下，0 = 已完成待搬）
      val outstanding = if (status == DownloadManager.STATUS_SUCCESSFUL) 0 else 1
      val destination = File(pending.destination)
      val marker = File(pending.destination + ".complete")
      val markerValid = try {
        destination.length() > 0 && marker.exists() && marker.readText().toLongOrNull() == destination.length()
      } catch (_: Exception) {
        false
      }
      mapOf(
        "id" to id,
        "destination" to pending.destination,
        "completed" to completed,
        "total" to 1,
        "outstanding" to outstanding,
        "status" to when {
          status == DownloadManager.STATUS_FAILED -> "failed"
          markerValid -> "completed"
          else -> "pending"
        },
        "error" to if (status == DownloadManager.STATUS_FAILED) "系统下载失败" else "",
      )
    }
  }

  /** 下完但还没搬的作业就地搬运（对账路径：App 被杀期间系统下完了） */
  @Synchronized
  fun assembleIfComplete(context: Context, jobId: String): Boolean {
    ensureLoaded(context)
    val pending = store[jobId] ?: return false
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager ?: return false
    if (queryStatus(manager, pending.downloadId) != DownloadManager.STATUS_SUCCESSFUL) return false
    return moveToDestination(context, jobId, pending)
  }

  @Synchronized
  fun assembleCompletedJobs(context: Context): Int {
    ensureLoaded(context)
    var assembled = 0
    for (jobId in store.keys.toList()) {
      if (assembleIfComplete(context, jobId)) assembled += 1
    }
    return assembled
  }

  @Synchronized
  fun cancel(context: Context, jobId: String) {
    ensureLoaded(context)
    val pending = store.remove(jobId)
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
    if (pending != null) {
      manager?.remove(pending.downloadId)
      File(pending.tempPath).delete()
      File(pending.destination + ".partial").delete()
      File(pending.destination + ".complete").delete()
    }
    persist(context)
  }

  // ---- 内部 ----

  /** DownloadManager 完成广播：把下完的临时文件搬到最终 destination */
  private fun ensureReceiver(context: Context) {
    if (receiver != null) return
    val appContext = context.applicationContext
    val listener = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        val event = intent ?: return
        if (event.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
        val id = event.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
        if (id < 0) return
        // File copies can be large. Never hold the UI/broadcast thread for them.
        // Pending metadata and the system temp file survive process interruption;
        // startup reconciliation will retry an unfinished copy.
        completionExecutor.execute { completeSystemDownload(appContext, id) }
      }
    }

    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    // Android 13+ 注册非系统广播必须声明导出性；这里收系统广播用 EXPORTED
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      appContext.registerReceiver(listener, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      appContext.registerReceiver(listener, filter)
    }
    receiver = listener
  }

  @Synchronized
  private fun completeSystemDownload(context: Context, id: Long) {
    val entry = store.entries.firstOrNull { it.value.downloadId == id } ?: return
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager ?: return
    when (queryStatus(manager, id)) {
      DownloadManager.STATUS_SUCCESSFUL -> moveToDestination(context, entry.key, entry.value)
      DownloadManager.STATUS_FAILED -> {
        failureListener?.invoke(Failure(entry.key, "系统下载失败"))
        store.remove(entry.key)
        persist(context)
      }
    }
  }

  /** 把临时文件搬到 JS 指定的内部 destination，成功后发 finished 事件 */
  private fun moveToDestination(context: Context, jobId: String, pending: Pending): Boolean {
    val temp = File(pending.tempPath)
    val expectedBytes = temp.length()
    if (!temp.exists() || expectedBytes <= 0) return false
    val destination = File(pending.destination)
    destination.parentFile?.mkdirs()
    val partial = File(destination.path + ".partial")
    val marker = File(destination.path + ".complete")
    partial.delete()
    marker.delete()
    val moved = try {
      temp.copyTo(partial, overwrite = true)
      if (partial.length() != expectedBytes) throw IllegalStateException("下载文件长度校验失败")
      if (destination.exists() && !destination.delete()) throw IllegalStateException("无法替换旧下载文件")
      if (!partial.renameTo(destination)) throw IllegalStateException("无法提交下载文件")
      if (destination.length() != expectedBytes) throw IllegalStateException("成品文件长度校验失败")
      marker.writeText(expectedBytes.toString())
      if (marker.readText() != expectedBytes.toString()) throw IllegalStateException("完成标记写入失败")
      temp.delete()
      true
    } catch (error: Exception) {
      partial.delete()
      destination.delete()
      marker.delete()
      failureListener?.invoke(Failure(jobId, error.message ?: "搬运下载文件失败"))
      false
    }
    if (!moved) return false
    val bytes = destination.length()
    store.remove(jobId)
    persist(context)
    progressListener?.invoke(Progress(jobId, 1, 1))
    finishListener?.invoke(Finished(jobId, pending.destination, bytes))
    return true
  }

  private fun queryStatus(manager: DownloadManager, downloadId: Long): Int {
    val query = DownloadManager.Query().setFilterById(downloadId)
    var cursor: Cursor? = null
    return try {
      cursor = manager.query(query)
      if (cursor != null && cursor.moveToFirst()) {
        val index = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        if (index >= 0) cursor.getInt(index) else DownloadManager.STATUS_FAILED
      } else {
        DownloadManager.STATUS_FAILED
      }
    } catch (error: Exception) {
      DownloadManager.STATUS_FAILED
    } finally {
      cursor?.close()
    }
  }

  // ---- 持久化（jobId 映射存 filesDir/audio-downloader/jobs.json）----

  private fun jobsFile(context: Context): File {
    val dir = File(context.filesDir, "audio-downloader")
    if (!dir.exists()) dir.mkdirs()
    return File(dir, "jobs.json")
  }

  private fun ensureLoaded(context: Context) {
    if (loaded) return
    loaded = true
    val file = jobsFile(context)
    val atomicFile = AtomicFile(file)
    try {
      val root = JSONObject(atomicFile.openRead().bufferedReader().use { it.readText() })
      val keys = root.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        val obj = root.getJSONObject(key)
        store[key] = Pending(
          obj.getLong("downloadId"),
          obj.getString("destination"),
          obj.getString("tempPath"),
        )
      }
    } catch (error: Exception) {
      // 坏了就当空表：下载状态会靠 DownloadManager 自己的记录兜底
    }
  }

  private fun persist(context: Context): Boolean {
    val atomicFile = AtomicFile(jobsFile(context))
    var output: java.io.FileOutputStream? = null
    try {
      val root = JSONObject()
      for ((id, pending) in store) {
        root.put(
          id,
          JSONObject().apply {
            put("downloadId", pending.downloadId)
            put("destination", pending.destination)
            put("tempPath", pending.tempPath)
          },
        )
      }
      output = atomicFile.startWrite()
      output.write(root.toString().toByteArray(Charsets.UTF_8))
      atomicFile.finishWrite(output)
      return true
    } catch (error: Exception) {
      if (output != null) atomicFile.failWrite(output)
      return false
    }
  }

  private fun sanitize(value: String): String = value.replace(Regex("[^\\w-]"), "_")
}
