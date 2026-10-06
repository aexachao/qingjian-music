import type { Track } from '@qj/core-domain'
import type { DownloadState } from '@/lib/download-policy'

export interface DownloadEntry {
  /** `serverId:trackId` */
  key: string
  serverId: string
  trackId: string
  title: string
  artistText: string
  coverId?: string
  fileName: string
  bytes: number
  downloadedAt: number
  /** 下载时的格式（播放时决定 contentType） */
  format?: string
  /**
   * 转码产物的播放 content-type。
   *
   * 转码曲目下载下来的是 fMP4（后缀 mp4），但 `format` 仍记原始格式（如 `dsf`）——
   * 那样 `contentTypeFor(format)` 会返回 undefined，RNTP 会拒播。所以转码产物
   * 显式记 `audio/mp4`，播放时优先用它（见 controller 的 `downloadedContentType`）。
   */
  contentType?: string
  /**
   * 完整领域曲目。
   *
   * 管理页要能**离线播放**，而 `playTrackList` 的入参是 `Track[]` —— 只存标题/艺术家
   * 就播不了（与队列页历史行同一个问题，那里也是靠 `QueueItem.track` 解决的）。
   */
  track?: Track
}

/** 正在下载的作业（仅内存；App 重启后由 native 的 pendingJobs + 磁盘对账恢复） */
export interface DownloadJobState {
  key: string
  state: DownloadState
  completed: number
  total: number
  error?: string
}

export interface DownloadIndex {
  version: 1
  entries: Record<string, DownloadEntry>
}

export interface DownloadJournalRecord {
  version: 1
  key: string
  attemptId: string
  state: 'pending' | 'completed'
  entry: DownloadEntry
}

export interface DownloadAttempt {
  key: string
  id: string
  controller: AbortController
  promise: Promise<void>
  cancelled: boolean
  nativeStarted: boolean
  nativeStartPending: boolean
  active: boolean
  finished: boolean
  resolve: () => void
  reject: (error: unknown) => void
}

export type Listener = () => void
