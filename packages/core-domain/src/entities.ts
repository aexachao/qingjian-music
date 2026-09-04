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
