package expo.modules.audiodownloader

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * 后台下载模块的 Android 侧（JS 出口在 `modules/audio-downloader/index.ts`）。
 *
 * 与 iOS 同一份契约：把一串 URL 下到一个文件 + 进度/完成/失败事件 + 对账。
 * 差异见 `AudioDownloaderSession`：Android 用系统 DownloadManager，只接单 URL 的直连下载；
 * 多分片的转码任务 `startJob` 返回 false，JS 侧回退前台拼接。
 */
class AudioDownloaderModule : Module() {
  class JobInput : Record {
    @Field var id: String = ""
    @Field var urls: List<String> = emptyList()
    @Field var headers: Map<String, String> = emptyMap()
    @Field var destination: String = ""
    @Field var partsDirectory: String = ""
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AudioDownloader")

    Events("onJobProgress", "onJobFinished", "onJobFailed")

    OnStartObserving { installListeners() }

    OnStopObserving { AudioDownloaderSession.clearListeners() }

    AsyncFunction("startJob") { input: JobInput ->
      if (input.id.isEmpty() || input.destination.isEmpty() || input.partsDirectory.isEmpty()) {
        throw InvalidJobException()
      }
      AudioDownloaderSession.start(
        context,
        AudioDownloaderSession.Job(
          id = input.id,
          urls = input.urls,
          headers = input.headers,
          destination = input.destination,
          partsDirectory = input.partsDirectory,
        ),
      )
    }

    AsyncFunction("pendingJobs") {
      AudioDownloaderSession.pendingJobs(context)
    }

    AsyncFunction("assembleJob") { jobId: String ->
      AudioDownloaderSession.assembleIfComplete(context, jobId)
    }

    AsyncFunction("cancelJob") { jobId: String ->
      AudioDownloaderSession.cancel(context, jobId)
    }

    AsyncFunction("assembleCompletedJobs") {
      AudioDownloaderSession.assembleCompletedJobs(context)
    }
  }

  private fun installListeners() {
    AudioDownloaderSession.setListeners(
      context,
      progress = { progress ->
        sendEvent(
          "onJobProgress",
          mapOf("id" to progress.id, "completed" to progress.completed, "total" to progress.total),
        )
      },
      finish = { finished ->
        sendEvent(
          "onJobFinished",
          mapOf("id" to finished.id, "destination" to finished.destination, "bytes" to finished.bytes),
        )
      },
      failure = { failure ->
        sendEvent("onJobFailed", mapOf("id" to failure.id, "reason" to failure.reason))
      },
    )
  }
}

internal class InvalidJobException :
  expo.modules.kotlin.exception.CodedException("后台下载作业缺少 id / destination / partsDirectory")
