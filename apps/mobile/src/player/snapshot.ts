import type { PlayMode, PlaySource, QueueItem } from '@qj/core-domain'
import { DEFAULT_PLAY_MODE } from '@qj/core-domain'

export const PLAYBACK_SNAPSHOT_VERSION = 3 as const

export type SnapshotQueueItem = Omit<QueueItem, 'artwork'>

export interface PlaybackSnapshot {
  version: typeof PLAYBACK_SNAPSHOT_VERSION
  serverId: string
  queue: SnapshotQueueItem[]
  history: SnapshotQueueItem[]
  baseQueue: SnapshotQueueItem[]
  index: number
  position: number
  playMode: PlayMode
  autoplay: boolean
  source?: PlaySource
  lyricOffsetMs: number
  savedAt: number
}

export type RestorablePlaybackSnapshot = Omit<PlaybackSnapshot, 'savedAt' | 'version'>

function sanitizeQueueItem(item: QueueItem): SnapshotQueueItem {
  const { artwork: _artwork, ...safe } = item
  return safe
}

/** 历史 occurrence 的快照上限（与 store 的 HISTORY_CAP 一致） */
export const SNAPSHOT_HISTORY_CAP = 200

/**
 * 历史入快照：**不去重**（同一首可多次出现，对齐收听流模型），只做上限截断。
 * 旧版按 qid 去重是为了堆前那套「永久去重」逻辑；现在历史条目 id 已各自唯一，无需去重。
 */
function cappedHistory(items: QueueItem[]): SnapshotQueueItem[] {
  const safe = items.map(sanitizeQueueItem)
  return safe.length > SNAPSHOT_HISTORY_CAP ? safe.slice(safe.length - SNAPSHOT_HISTORY_CAP) : safe
}

export function createPlaybackSnapshot(input: {
  serverId: string
  queue: QueueItem[]
  history: QueueItem[]
  baseQueue: QueueItem[]
  index: number
  position: number
  playMode: PlayMode
  autoplay: boolean
  source?: PlaySource
  lyricOffsetMs: number
  savedAt: number
}): PlaybackSnapshot {
  return {
    ...input,
    version: PLAYBACK_SNAPSHOT_VERSION,
    queue: input.queue.map(sanitizeQueueItem),
    history: input.history.map(sanitizeQueueItem),
    baseQueue: input.baseQueue.map(sanitizeQueueItem),
  }
}

export function parsePlaybackSnapshot(value: unknown): RestorablePlaybackSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<PlaybackSnapshot> & { version?: unknown }
  if (parsed.version !== PLAYBACK_SNAPSHOT_VERSION || !Array.isArray(parsed.queue) || parsed.queue.length === 0) {
    return null
  }

  const history = Array.isArray(parsed.history) ? parsed.history : []
  const safeHistory = cappedHistory(history as QueueItem[])
  const baseQueue = Array.isArray(parsed.baseQueue) ? parsed.baseQueue : parsed.queue
  const queue = parsed.queue.map((item) => sanitizeQueueItem(item as QueueItem))
  const safeBaseQueue = baseQueue.map((item) => sanitizeQueueItem(item as QueueItem))
  const index = Number.isInteger(parsed.index) ? Math.min(Math.max(parsed.index ?? 0, 0), queue.length - 1) : 0
  const position = typeof parsed.position === 'number' && Number.isFinite(parsed.position) ? Math.max(parsed.position, 0) : 0

  return {
    serverId: typeof parsed.serverId === 'string' ? parsed.serverId : '',
    queue,
    history: safeHistory,
    baseQueue: safeBaseQueue.length === queue.length ? safeBaseQueue : queue,
    index,
    position,
    playMode: { ...DEFAULT_PLAY_MODE, ...(parsed.playMode ?? {}) },
    autoplay: Boolean(parsed.autoplay),
    ...(parsed.source ? { source: parsed.source } : {}),
    lyricOffsetMs:
      typeof parsed.lyricOffsetMs === 'number' && Number.isFinite(parsed.lyricOffsetMs) ? parsed.lyricOffsetMs : 0,
  }
}
