import { Platform } from 'react-native'
import { NativeModule, requireOptionalNativeModule } from 'expo'

/**
 * 后台分片下载模块的 JS 出口。
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 把「一串 URL 按序下成一个文件」交给系统后台下载，App 挂起/被杀都继续。
 *
 * ── 平台差异（重要，别假装一致）────────────────────────────────────────────
 * · iOS：后台 URLSession —— 能把「多分片按序拼成一个文件」交给系统，App 挂起/被杀都续。
 * · Android：用系统 **DownloadManager** —— 同样真后台（切后台/锁屏/被杀都续），
 *   但它一个任务只下一个 URL，拼不了多分片：所以**只接直连原文件**（单 URL），
 *   多分片的转码任务 `startJob` 返回 false，让 JS 走前台拼接（转码本来就要 10 秒心跳、
 *   只能在 App 活着时下，见 `player/downloads.ts`）。
 * · 两端 `hasNativeDownloader()` 都为 true（只要原生模块在）。
 */

export interface AudioDownloadJob {
  /** 作业 id（调用方生成，用于进度、取消与对账） */
  id: string
  /** 有序 URL：`init.mp4` 在前，之后是各分片（fMP4 拼接顺序） */
  urls: string[]
  /** 每个请求都要带的头（飞牛的分片要鉴权） */
  headers: Record<string, string>
  /** 成品文件绝对路径（不带 file://） */
  destination: string
  /** 分片临时目录绝对路径 */
  partsDirectory: string
}

export interface JobProgressEvent {
  id: string
  completed: number
  total: number
}

export interface JobFinishedEvent {
  id: string
  destination: string
  bytes: number
}

export interface JobFailedEvent {
  id: string
  reason: string
}

export interface PendingJob {
  id: string
  destination: string
  completed: number
  total: number
  /** 系统队列里还挂着的任务数（对账时判断「还在下」还是「可以拼了」） */
  outstanding: number
  status?: 'pending' | 'completed' | 'failed'
  error?: string
}

type AudioDownloaderEvents = {
  onJobProgress: (event: JobProgressEvent) => void
  onJobFinished: (event: JobFinishedEvent) => void
  onJobFailed: (event: JobFailedEvent) => void
}

// 用 `declare class`（而不是 interface）：`NativeModule<...>` 是类类型，
// 类才有 addListener 这类实例成员；interface extends 拿不到映射出来的成员。
declare class AudioDownloaderNativeModule extends NativeModule<AudioDownloaderEvents> {
  startJob(job: AudioDownloadJob): Promise<boolean>
  pendingJobs(): Promise<PendingJob[]>
  assembleJob(jobId: string): Promise<boolean>
  cancelJob(jobId: string): Promise<void>
  assembleCompletedJobs(): Promise<number>
}

const native = requireOptionalNativeModule<AudioDownloaderNativeModule>('AudioDownloader')

/** 这台设备上有没有原生后台下载能力（iOS 后台会话 / Android DownloadManager） */
export function hasNativeDownloader(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && native != null
}

/** 启动一个作业；没有原生实现时返回 false，调用方走 JS 回退 */
export async function startAudioDownloadJob(job: AudioDownloadJob): Promise<boolean> {
  if (!native) return false
  return native.startJob(job)
}

export async function pendingAudioDownloadJobs(): Promise<PendingJob[]> {
  if (!native) return []
  return native.pendingJobs()
}

export async function assembleAudioDownloadJob(jobId: string): Promise<boolean> {
  if (!native) return false
  return native.assembleJob(jobId)
}

export async function cancelAudioDownloadJob(jobId: string): Promise<void> {
  if (!native) return
  await native.cancelJob(jobId)
}

export async function assembleCompletedAudioDownloads(): Promise<number> {
  if (!native) return 0
  return native.assembleCompletedJobs()
}

/** 订阅进度 / 完成 / 失败。返回退订函数 */
export function subscribeAudioDownload(handlers: {
  onProgress?: (event: JobProgressEvent) => void
  onFinished?: (event: JobFinishedEvent) => void
  onFailed?: (event: JobFailedEvent) => void
}): () => void {
  if (!native) return () => {}
  const subscriptions = [
    handlers.onProgress ? native.addListener('onJobProgress', handlers.onProgress) : null,
    handlers.onFinished ? native.addListener('onJobFinished', handlers.onFinished) : null,
    handlers.onFailed ? native.addListener('onJobFailed', handlers.onFailed) : null
  ].filter(Boolean) as { remove(): void }[]
  return () => {
    for (const subscription of subscriptions) subscription.remove()
  }
}
