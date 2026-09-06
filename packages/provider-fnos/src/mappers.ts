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
  LyricWord,
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
    sizeBytes: opt(spec.size),
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

const SORT_ALIASES: Record<string, Record<string, string>> = {
  album: { createdAt: 'newTrackAddedAt' },
  favoriteTrack: { createdAt: 'favoriteAt' },
}

/** 排序字段别名：飞牛不同列表用的字段名不一致（web 端也是这么映射的） */
export function formatSort(sort: SortSpec | undefined, scope?: keyof typeof SORT_ALIASES | string): string | undefined {
  if (!sort) return undefined
  const alias = scope ? SORT_ALIASES[scope]?.[sort.field] : undefined
  return `${alias ?? sort.field},${sort.order}`
}

const LRC_LINE = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s?(.*)$/
/** 增强型 LRC 的逐词时间：行正文里的 [mm:ss.xx]word */
const WORD_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

function timeFromGroups(minutesRaw: string, secondsRaw: string, fractionRaw: string): number {
  const minutes = Number(minutesRaw ?? 0)
  const seconds = Number(secondsRaw ?? 0)
  const fraction = Number((fractionRaw ?? '0').padEnd(3, '0'))
  return minutes * 60_000 + seconds * 1000 + fraction
}

/**
 * 解析 LRC；没有时间轴就退化成纯文本歌词。
 * 正文里出现多个时间标签（增强型 LRC 的 [mm:ss.xx]word 写法）时，
 * 把这一行拆成带逐词时间轴的 words——App 端靠它做「跟人声」的卡拉OK；
 * 只有整行一个时间的就是普通 LRC，走整行高亮。
 */
export function parseLyrics(raw: string, source?: string): LyricSheet {
  const lines: LyricLine[] = []
  let synced = false
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const matched = LRC_LINE.exec(line)
    if (!matched) {
      if (!line.startsWith('[')) lines.push({ atMs: 0, text: line })
      continue
    }
    synced = true
    const headAtMs = timeFromGroups(matched[1] ?? '', matched[2] ?? '', matched[3] ?? '')
    const body = (matched[4] ?? '').trim()
    if (!body) continue

    // 行正文里是否还嵌了词级时间
    const words: LyricWord[] = []
    WORD_TAG.lastIndex = 0
    let cursor = 0
    let match: RegExpExecArray | null
    const parts: LyricWord[] = []
    while ((match = WORD_TAG.exec(body)) !== null) {
      const atMs = timeFromGroups(match[1] ?? '', match[2] ?? '', match[3] ?? '')
      const text = body.slice(cursor, match.index)
      cursor = match.index + match[0].length
      if (text) parts.push({ text, atMs })
    }
    if (parts.length >= 2) {
      const rest = body.slice(cursor)
      if (rest) parts[parts.length - 1] = { ...parts[parts.length - 1]!, text: parts[parts.length - 1]!.text + rest }
      words.push(...parts)
      const fullText = parts.map((part) => part.text).join('')
      lines.push({ atMs: headAtMs, text: fullText, words })
    } else {
      lines.push({ atMs: headAtMs, text: body })
    }
  }
  lines.sort((a, b) => a.atMs - b.atMs)
  return { synced, lines, offsetMs: 0, source }
}

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