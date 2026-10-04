import type { CanonicalAlbum, CanonicalTrack } from '@qj/core-domain'
import { normalizeName } from '@qj/core-domain'
import { normalizeBaseUrl, useExternalSourcesStore, type SourceService, type SourceType } from '@/lib/external-source'

export type CatalogFailure = 'empty' | 'ambiguous' | 'error' | 'unsupported' | 'source-changed'

export interface MusicInfoSourceRef {
  type: SourceType
  serviceId: string
  instanceId: string
}

export interface CatalogAlbum extends CanonicalAlbum {
  externalId: string
  source: MusicInfoSourceRef
  artistName: string
  artistId?: string
  coverUrl?: string
  releaseDate?: string
  edition?: string
  totalTracks?: number
}

export interface CatalogTrack extends CanonicalTrack {
  externalId?: string
  discNo?: number
}

export type CatalogPage<T> =
  | { status: 'ok'; items: T[]; nextCursor?: string; total?: number; source: MusicInfoSourceRef }
  | { status: CatalogFailure; message?: string }

const TIMEOUT_MS = 8000
const PAGE_SIZE = 100

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function activeInfoService(): SourceService | undefined {
  const services = useExternalSourcesStore.getState().services
  const candidates = services.filter((service) =>
    service.useMusicInfo &&
    (service.type === 'netease' || service.type === 'qq') &&
    normalizeBaseUrl(service.baseUrl),
  )
  const priority: SourceType[] = ['netease', 'qq']
  candidates.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))
  return candidates[0]
}

export function getMusicInfoSourceRef(): MusicInfoSourceRef | undefined {
  const state = useExternalSourcesStore.getState()
  const service = activeInfoService()
  if (!service) return undefined
  // revision changes when token, endpoint, or capability settings change. It is
  // deliberately hashed with the source identity; the token itself never leaves
  // the external-source store.
  const identity = `${service.id}\n${service.type}\n${normalizeBaseUrl(service.baseUrl)}\n${state.revision}`
  return { type: service.type, serviceId: service.id, instanceId: fnv1a(identity) }
}

function currentService(expected?: MusicInfoSourceRef): SourceService | undefined {
  const service = activeInfoService()
  if (!service) return undefined
  const actual = getMusicInfoSourceRef()
  if (expected && (expected.serviceId !== service.id || expected.type !== service.type || expected.instanceId !== actual?.instanceId)) return undefined
  return service
}

function isCurrentSource(expected: MusicInfoSourceRef): boolean {
  const actual = getMusicInfoSourceRef()
  return actual?.serviceId === expected.serviceId && actual.type === expected.type && actual.instanceId === expected.instanceId
}

async function getJson(url: string, token?: string): Promise<{ ok: boolean; data?: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: token ? { Authorization: token } : {} })
    if (!response.ok) return { ok: false }
    return { ok: true, data: await response.json() }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

function sourceRef(service: SourceService): MusicInfoSourceRef {
  const state = useExternalSourcesStore.getState()
  const identity = `${service.id}\n${service.type}\n${normalizeBaseUrl(service.baseUrl)}\n${state.revision}`
  return { type: service.type, serviceId: service.id, instanceId: fnv1a(identity) }
}

function appendQuery(base: string, path: string): string {
  return `${normalizeBaseUrl(base)}${path}`
}

function hasSuccessfulCode(data: any): boolean {
  return data !== null && typeof data === 'object' && (!('code' in data) || data.code === 200 || data.code === '200')
}

function unwrapArtistCandidates(data: any): { id: number | string; name: string }[] | undefined {
  const candidates = data?.result?.artists ?? data?.artists
  if (!Array.isArray(candidates)) return undefined
  if (candidates.some((candidate) =>
    !candidate || typeof candidate !== 'object' ||
    (typeof candidate.id !== 'string' && typeof candidate.id !== 'number') || String(candidate.id).trim() === '' ||
    typeof candidate.name !== 'string',
  )) return undefined
  return candidates
}

async function resolveArtist(service: SourceService, artist: string): Promise<
  | { status: 'ok'; id: string }
  | { status: 'empty' | 'ambiguous' | 'error' }
> {
  const base = normalizeBaseUrl(service.baseUrl)
  const response = await getJson(appendQuery(base, `/search?type=100&limit=20&keywords=${encodeURIComponent(artist)}`), service.token?.trim())
  if (!response.ok) return { status: 'error' }
  if (!hasSuccessfulCode(response.data)) return { status: 'error' }
  const candidates = unwrapArtistCandidates(response.data)
  if (!candidates) return { status: 'error' }
  const exact = candidates.filter((candidate) => normalizeName(candidate.name) === normalizeName(artist))
  if (exact.length === 0) return { status: 'empty' }
  const exactIds = [...new Set(exact.map((candidate) => String(candidate.id)))]
  if (exactIds.length !== 1) return { status: 'ambiguous' }
  return { status: 'ok', id: exactIds[0]! }
}

async function resolveAlbumId(service: SourceService, artist: string, album: string): Promise<
  | { status: 'ok'; id: string }
  | { status: 'empty' | 'ambiguous' | 'error' }
> {
  const artistResult = await resolveArtist(service, artist)
  if (artistResult.status !== 'ok') return artistResult
  const keywords = `${album} ${artist}`.trim()
  const response = await getJson(
    appendQuery(normalizeBaseUrl(service.baseUrl), `/search?type=10&limit=30&keywords=${encodeURIComponent(keywords)}`),
    service.token?.trim(),
  )
  if (!response.ok || !hasSuccessfulCode(response.data)) return { status: 'error' }
  const candidates = response.data?.result?.albums ?? response.data?.albums
  if (!Array.isArray(candidates)) return { status: 'error' }
  if (candidates.some((candidate: any) =>
    !candidate || typeof candidate !== 'object' ||
    (typeof candidate.id !== 'string' && typeof candidate.id !== 'number') || String(candidate.id).trim() === '' ||
    typeof candidate.name !== 'string',
  )) return { status: 'error' }
  const exact = candidates.filter((candidate: any) => {
    if (normalizeName(candidate.name) !== normalizeName(album)) return false
    const artists = Array.isArray(candidate.artists) ? candidate.artists : candidate.artist ? [candidate.artist] : []
    return artists.some((candidateArtist: any) =>
      typeof candidateArtist?.name === 'string' && normalizeName(candidateArtist.name) === normalizeName(artist),
    )
  })
  if (exact.length === 0) return { status: 'empty' }
  const exactIds = [...new Set(exact.map((candidate: any) => String(candidate.id)))]
  if (exactIds.length !== 1) return { status: 'ambiguous' }
  return { status: 'ok', id: exactIds[0]! }
}

function parseAlbum(item: any, artistName: string, artistId: string, source: MusicInfoSourceRef): CatalogAlbum | undefined {
  const id = item?.id
  const name = typeof item?.name === 'string' ? item.name.trim() : ''
  if (id === undefined || !name) return undefined
  const publishTime = typeof item.publishTime === 'number' ? item.publishTime : undefined
  const year = publishTime ? new Date(publishTime).getFullYear() : undefined
  const releaseDate = publishTime ? new Date(publishTime).toISOString().slice(0, 10) : undefined
  const artist = Array.isArray(item.artists) ? item.artists[0] : item.artist
  const albumArtistName = typeof artist?.name === 'string' ? artist.name : artistName
  const albumArtistId = artist?.id === undefined ? artistId : String(artist.id)
  const edition = typeof item.subType === 'string' && item.subType.trim() ? item.subType.trim() : undefined
  return {
    name,
    externalId: String(id),
    artistName: albumArtistName,
    artistId: albumArtistId,
    source,
    ...(item.picUrl ? { coverUrl: item.picUrl } : {}),
    ...(releaseDate ? { releaseDate } : {}),
    ...(year && year > 1900 ? { year } : {}),
    ...(edition ? { edition } : {}),
    ...(typeof item.size === 'number' ? { totalTracks: item.size } : {}),
  }
}

/** Fetch one page of an explicitly configured catalog. Cursor is opaque and provider-scoped. */
export async function fetchCanonicalArtistAlbumPage(
  artistName: string,
  cursor?: string,
  expectedSource?: MusicInfoSourceRef,
): Promise<CatalogPage<CatalogAlbum>> {
  const service = currentService(expectedSource)
  if (!service) return { status: expectedSource ? 'source-changed' : 'empty' }
  if (service.type !== 'netease') return { status: 'unsupported', message: '当前音乐信息源暂不支持艺人专辑目录' }
  const source = sourceRef(service)
  const artistKey = normalizeName(artistName)
  if (!artistKey) return { status: 'empty' }
  let artistId: string
  let offset = 0
  if (cursor) {
    try {
      const parsed = JSON.parse(cursor) as { artistId?: string; artistKey?: string; offset?: number; instanceId?: string; serviceId?: string }
      if (!parsed.artistId || parsed.artistKey !== artistKey || parsed.instanceId !== source.instanceId ||
        parsed.serviceId !== source.serviceId || !Number.isSafeInteger(parsed.offset) || (parsed.offset ?? -1) < 0 ||
        (parsed.offset ?? 0) % PAGE_SIZE !== 0) {
        return { status: 'source-changed' }
      }
      artistId = parsed.artistId
      offset = parsed.offset!
    } catch {
      return { status: 'error' }
    }
  } else {
    const resolved = await resolveArtist(service, artistName)
    if (!isCurrentSource(source)) return { status: 'source-changed' }
    if (resolved.status !== 'ok') return { status: resolved.status }
    artistId = resolved.id
  }

  const response = await getJson(
    appendQuery(normalizeBaseUrl(service.baseUrl), `/artist/album?id=${encodeURIComponent(artistId)}&limit=${PAGE_SIZE}&offset=${offset}`),
    service.token?.trim(),
  )
  if (!isCurrentSource(source)) return { status: 'source-changed' }
  if (!response.ok) return { status: 'error' }
  if (!hasSuccessfulCode(response.data)) return { status: 'error' }
  const data = response.data?.hotAlbums ?? response.data?.albums
  if (!Array.isArray(data) || typeof response.data?.more !== 'boolean') return { status: 'error' }
  if (response.data?.artist?.id !== undefined && String(response.data.artist.id) !== artistId) return { status: 'ambiguous', message: '外部艺人信息与当前页面不一致' }
  const items = data
    .map((item: any) => parseAlbum(item, artistName, artistId, source))
    .filter((item: CatalogAlbum | undefined): item is CatalogAlbum => Boolean(item))
  if (data.length > 0 && items.length === 0) return { status: 'error' }
  if (response.data.more && data.length === 0) return { status: 'error', message: '外部艺人专辑目录返回空页但仍提示有更多内容' }
  if (items.length === 0 && offset === 0) return { status: 'empty' }
  const more = response.data.more
  const nextCursor = more
    ? JSON.stringify({ artistId, artistKey, offset: offset + PAGE_SIZE, serviceId: source.serviceId, instanceId: source.instanceId })
    : undefined
  // albumSize is an approximate search statistic (and has been observed to
  // disagree with the number of pages), so it must never drive completion.
  return { status: 'ok', items, ...(nextCursor ? { nextCursor } : {}), source }
}

/** Fetch a catalog tracklist by ID, or resolve a unique artist-and-album match for a local route. */
export async function fetchCanonicalAlbumTracks(
  artist: string,
  album: string,
  externalId?: string,
  expectedSource?: MusicInfoSourceRef,
): Promise<CatalogPage<CatalogTrack>> {
  const service = currentService(expectedSource)
  if (!service) return { status: expectedSource ? 'source-changed' : 'empty' }
  if (service.type !== 'netease') return { status: 'unsupported', message: '当前音乐信息源暂不支持专辑曲目目录' }
  const source = sourceRef(service)
  let resolvedId = externalId
  if (!resolvedId) {
    const resolved = await resolveAlbumId(service, artist, album)
    if (!isCurrentSource(source)) return { status: 'source-changed' }
    if (resolved.status !== 'ok') {
      return {
        status: resolved.status,
        ...(resolved.status === 'ambiguous' ? { message: '存在多个同名专辑，无法安全确认' } : {}),
      }
    }
    resolvedId = resolved.id
  }
  const response = await getJson(appendQuery(normalizeBaseUrl(service.baseUrl), `/album?id=${encodeURIComponent(resolvedId)}`), service.token?.trim())
  if (!isCurrentSource(source)) return { status: 'source-changed' }
  if (!response.ok) return { status: 'error' }
  const data = response.data
  if (!hasSuccessfulCode(data) || !data.album || !Array.isArray(data.songs)) return { status: 'error' }
  if (data.album.id !== undefined && String(data.album.id) !== resolvedId) return { status: 'ambiguous', message: '外部专辑编号与当前页面不一致' }
  const actualName = data?.album?.name
  if (typeof actualName !== 'string' || normalizeName(actualName) !== normalizeName(album)) return { status: 'ambiguous', message: '外部专辑信息与当前页面不一致' }
  const rawArtists = Array.isArray(data.album.artists) ? data.album.artists : data.album.artist ? [data.album.artist] : []
  if (rawArtists.length === 0 || rawArtists.some((item: any) => typeof item?.name !== 'string')) return { status: 'ambiguous', message: '外部艺术家信息无法确认' }
  if (!rawArtists.some((item: any) => normalizeName(item.name) === normalizeName(artist))) return { status: 'ambiguous', message: '外部艺术家信息与当前页面不一致' }
  const rawTracks = data.songs
  if (rawTracks.some((item: any) => !item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim())) return { status: 'error' }
  const items: CatalogTrack[] = rawTracks
    .map((item: any) => ({
      title: item.name,
      ...(item.id !== undefined ? { externalId: String(item.id) } : {}),
      ...(typeof item.no === 'number' && item.no > 0 ? { trackNo: item.no } : {}),
      ...(Number.isFinite(Number(item.cd)) && Number(item.cd) > 0 ? { discNo: Number(item.cd) } : {}),
    }))
  if (items.length === 0) return { status: 'empty' }
  return { status: 'ok', items, total: items.length, source }
}

/** Compatibility helper for older completeness callers. */
export async function fetchCanonicalArtistAlbums(artist: string): Promise<CanonicalAlbum[] | null> {
  const page = await fetchCanonicalArtistAlbumPage(artist)
  return page.status === 'ok' ? page.items : null
}

export function hasMusicInfoSource(): boolean {
  return Boolean(getMusicInfoSourceRef())
}
