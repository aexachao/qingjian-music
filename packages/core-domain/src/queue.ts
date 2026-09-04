import type { HttpResource } from './media'
import type { EntityId, QualifiedId, ServerId } from './ids'

/**
 * 播放队列元素。
 * 字段刻意做全：锁屏 / 通知栏 / 后续 CarPlay 与 Android Auto 都直接消费它，
 * 不再回头查 provider，避免在车机场景发额外请求。
 */
export interface QueueItem {
  qid: QualifiedId
  serverId: ServerId
  trackId: EntityId
  title: string
  artistText: string
  albumText?: string
  durationMs: number
  artwork?: HttpResource
  /** 漫游电台的上下文游标，普通队列为空 */
  radioCursor?: string
}

export type RepeatMode = 'off' | 'queue' | 'one'

export interface PlayMode {
  repeat: RepeatMode
  shuffle: boolean
}

export const DEFAULT_PLAY_MODE: PlayMode = { repeat: 'off', shuffle: false }
