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
  /** 专辑 / 艺术家 id，队列页和正在播放页用它跳回来源 */
  albumId?: EntityId
  artistId?: EntityId
  /** 收藏状态，随曲目载荷带下来，收藏按钮直接用 */
  isFavorite?: boolean
  /** 漫游电台的上下文游标，普通队列为空 */
  radioCursor?: string
  /** 音频格式（flac / mp3 …），播放缓存靠它决定文件后缀与 contentType */
  format?: string
  /** 源文件字节数，播放缓存用它算配额 */
  sizeBytes?: number
}

/** 队列的来源，用于展示「正在播放来自…」并支持跳回去 */
export type PlaySourceKind =
  | 'album'
  | 'artist'
  | 'genre'
  | 'playlist'
  | 'favorites'
  | 'history'
  | 'tracks'
  | 'search'
  | 'radio'
  | 'debug'

export interface PlaySource {
  kind: PlaySourceKind
  /** album / artist / genre / playlist 才有 */
  id?: EntityId
  /** 直接展示的中文文案，例如「专辑 · 范特西」 */
  label: string
}

export type RepeatMode = 'off' | 'queue' | 'one'

export interface PlayMode {
  repeat: RepeatMode
  shuffle: boolean
}

export const DEFAULT_PLAY_MODE: PlayMode = { repeat: 'off', shuffle: false }
