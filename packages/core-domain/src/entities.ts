import type { EntityId } from './ids'

export interface ArtistRef {
  id: EntityId
  name: string
  coverId?: string
}

export interface AlbumRef {
  id: EntityId
  name: string
  coverId?: string
  releaseDate?: string
}

export interface GenreRef {
  id: EntityId
  name: string
}

/** 音频规格，用于「无损 / Hi-Res」角标与是否需要转码的判断 */
export interface AudioSpec {
  codec?: string
  format?: string
  container?: string
  bitrateBps?: number
  sampleRateHz?: number
  bitDepth?: number
  channels?: number
  durationMs?: number
  /** 源文件字节数，播放缓存用它算配额 */
  sizeBytes?: number
  /** 服务端文件路径，仅用于诊断展示 */
  path?: string
}

export interface Track {
  id: EntityId
  title: string
  durationMs: number
  coverId?: string
  album?: AlbumRef
  artists: ArtistRef[]
  genres: GenreRef[]
  trackNo?: number
  discNo?: number
  year?: number
  isrc?: string
  isCue: boolean
  /** 是否已收藏；后端不返回该字段时为 undefined */
  isFavorite?: boolean
  /** unix 秒 */
  addedAt?: number
  updatedAt?: number
  audio?: AudioSpec
}

export interface Album {
  id: EntityId
  name: string
  coverId?: string
  releaseDate?: string
  barcode?: string
  artists: ArtistRef[]
  trackCount?: number
  addedAt?: number
  updatedAt?: number
}

export interface Artist {
  id: EntityId
  name: string
  coverId?: string
  trackCount?: number
  albumCount?: number
}

export interface Genre {
  id: EntityId
  name: string
  coverId?: string
  trackCount?: number
}

export interface Playlist {
  id: EntityId
  name: string
  coverId?: string
  description?: string
  trackCount?: number
  createdAt?: number
  updatedAt?: number
}

export interface SessionUser {
  id: EntityId
  name: string
  isAdmin: boolean
}

/** 音乐库（飞牛的 shared-library）。名字可能是空串。 */
export interface MusicLibrary {
  id: EntityId
  /** 可能为空串，UI 要兜底成路径末段或「音乐库」 */
  name: string
  path: string
  /** unix 秒，库内容最后变化时间 */
  contentLastChangedAt?: number
}

/** 后台任务（当前只关心曲库扫描 fileScan） */
export interface BackgroundTask {
  id: EntityId
  /** 飞牛实测有 fileScan；其它类型原样透传 */
  type: string
  /** 任务名（飞牛给的是库名） */
  name: string
  /** 已成功处理的文件数 */
  successCount: number
  /** 总数——**边扫边长**，不是固定分母（见 fnos-music-api.md） */
  total: number
  /** 失败数，1~2 正常 */
  failCount: number
  done: boolean
  canceled: boolean
  /** 关联的音乐库 guid（ext.libraryGUID） */
  libraryId?: string
}
