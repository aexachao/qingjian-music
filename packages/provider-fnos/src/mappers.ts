import type {
  Album,
  AlbumRef,
  Artist,
  ArtistRef,
  AudioSpec,
  Genre,
  GenreRef,
  LyricLine,
  LyricSheet,
  Playlist,
  SessionUser,
  SortSpec,
  Track,
} from '@qj/core-domain'
import type { FnAlbum, FnArtist, FnAudioSpec, FnGenre, FnLyricEntry, FnPlaylist, FnTrack, FnUser } from './schemas'

/** null -> undefined，领域模型里统一只用 undefined 表示缺失 */
function opt<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value
}

export function mapUser(user: FnUser): SessionUser {
  return { id: user.guid, name: user.name, isAdmin: user.role === 'admin' }
}

export function mapArtistRef(artist: { guid: string; name: string; coverId?: string | null }): ArtistRef {
  return { id: artist.guid, name: artist.name, coverId: opt(artist.coverId) }
}

export function mapAlbumRef(album: { guid: string; name: string; coverId?: string | null; releaseDate?: string | null }): AlbumRef {
  return { id: album.guid, name: album.name, coverId: opt(album.coverId), releaseDate: opt(album.releaseDate) }
}

export function mapGenreRef(genre: { guid: string; name: string }): GenreRef {
  return { id: genre.guid, name: genre.name }
}

export function mapAudioSpec(spec: FnAudioSpec | null | undefined): AudioSpec | undefined {
  if (!spec) return undefined
  return {
    codec: opt(spec.codec),
    format: opt(spec.format),
    container: opt(spec.container) || undefined,
    bitrateBps: opt(spec.bitrate),
    sampleRateHz: opt(spec.sampleRate),
    bitDepth: opt(spec.bitDepth),
    channels: opt(spec.channel) ?? opt(spec.channels),
    durationMs: opt(spec.duration),
    path: opt(spec.path),
  }
}

export function mapTrack(track: FnTrack): Track {
  return {
    id: track.guid,
    title: track.title,
    durationMs: opt(track.duration) ?? 0,
    coverId: opt(track.coverId) ?? opt(track.album?.coverId),
    album: track.album ? mapAlbumRef(track.album) : undefined,
    artists: (track.artists ?? []).map(mapArtistRef),
    genres: (track.genres ?? []).map(mapGenreRef),
    trackNo: opt(track.trackNo),
    discNo: opt(track.discNo),
    year: opt(track.year),
    isrc: opt(track.isrc),
    isCue: opt(track.isCue) ?? false,
    isFavorite: opt(track.isFavorite),
    addedAt: opt(track.createdAt),
    updatedAt: opt(track.updatedAt),
    audio: mapAudioSpec(track.audioSpec),
  }
}

export function mapAlbum(album: FnAlbum): Album {
  return {
    id: album.guid,
    name: album.name,
    coverId: opt(album.coverId),
    releaseDate: opt(album.releaseDate),
    barcode: opt(album.barcode),
    artists: (album.artists ?? []).map(mapArtistRef),
    trackCount: opt(album.trackCount),
    addedAt: opt(album.createdAt),
    updatedAt: opt(album.updatedAt),
  }
}

export function mapArtist(artist: FnArtist): Artist {
  return {
    id: artist.guid,
    name: artist.name,
    coverId: opt(artist.coverId),
    trackCount: opt(artist.trackCount),
    albumCount: opt(artist.albumCount),
  }
}

export function mapGenre(genre: FnGenre): Genre {
  return { id: genre.guid, name: genre.name, coverId: opt(genre.coverId), trackCount: opt(genre.trackCount) }
}

export function mapPlaylist(playlist: FnPlaylist): Playlist {
  return {
    id: playlist.guid,
    name: playlist.name,
    coverId: opt(playlist.coverId),
    description: opt(playlist.description),
    trackCount: opt(playlist.trackCount),
    createdAt: opt(playlist.createdAt),
    updatedAt: opt(playlist.updatedAt),
  }
}

/** 排序字段别名：飞牛不同列表用的字段名不一致（web 端也是这么映射的） */
const SORT_ALIASES: Record<string, Record<string, string>> = {
  album: { createdAt: 'newTrackAddedAt' },
  favoriteTrack: { createdAt: 'favoriteAt' },
}

export function formatSort(sort: SortSpec | undefined, scope?: keyof typeof SORT_ALIASES | string): string | undefined {
  if (!sort) return undefined
  const alias = scope ? SORT_ALIASES[scope]?.[sort.field] : undefined
  return `${alias ?? sort.field},${sort.order}`
}

const LRC_LINE = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s?(.*)$/

/** 解析 LRC；没有时间轴就退化成纯文本歌词 */
export function parseLyrics(raw: string, source?: string): LyricSheet {
  const lines: LyricLine[] = []
  let synced = false
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const matched = LRC_LINE.exec(line)
    if (matched) {
      synced = true
      const minutes = Number(matched[1] ?? 0)
      const seconds = Number(matched[2] ?? 0)
      const fractionRaw = matched[3] ?? '0'
      const fraction = Number(fractionRaw.padEnd(3, '0'))
      const text = (matched[4] ?? '').trim()
      if (!text) continue
      lines.push({ atMs: minutes * 60_000 + seconds * 1000 + fraction, text })
    } else if (!line.startsWith('[')) {
      lines.push({ atMs: 0, text: line })
    }
  }
  lines.sort((a, b) => a.atMs - b.atMs)
  return { synced, lines, offsetMs: 0, source }
}

/**
 * 把 /lyric/list 的结果映射成歌词表：
 * 优先取 `preferred`（首选条目的 guid）指向的那条，取不到就用第一条有正文的。
 * 服务端的 `offset` 单位是毫秒、正值表示歌词提前（与 web 端 `currentTime + offset` 的用法一致）。
 */
export function mapLyricSheet(entries: FnLyricEntry[], preferredGuid?: string | null): LyricSheet | null {
  const usable = entries.filter((entry) => typeof entry.content === 'string' && entry.content.trim().length > 0)
  if (usable.length === 0) return null
  const picked = usable.find((entry) => entry.guid === preferredGuid) ?? usable[0]!
  const source = picked.source === null || picked.source === undefined ? undefined : String(picked.source)
  const sheet = parseLyrics(picked.content!, source)
  return {
    ...sheet,
    id: picked.guid,
    offsetMs: Math.round(picked.offset ?? 0),
    synced: picked.isLRC ?? sheet.synced,
  }
}
