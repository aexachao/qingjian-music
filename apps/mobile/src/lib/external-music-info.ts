import type { CanonicalAlbum, CanonicalTrack } from '@qj/core-domain'
import { normalizeName } from '@qj/core-domain'
import { getMusicInfoSource, hasMusicInfoSource, normalizeBaseUrl } from '@/lib/external-source'

export { hasMusicInfoSource }

/**
 * 音乐信息源适配器：从用户自填的国内服务取「规范专辑曲目 / 艺人作品集」，供完整度计算。
 *
 * 先做**网易云(api-enhanced 一脉)**——它返回干净、稳定、有文档的 JSON：
 *   - /search?type=10  专辑搜索 → result.albums[]
 *   - /album?id=       专辑详情 → { songs:[{name,no}] }
 *   - /search?type=100 歌手搜索 → result.artists[]
 *   - /artist/album?id= 歌手专辑 → { hotAlbums:[{name,publishTime}] }
 * QQ(Rain120)返回腾讯原始生结构，需对着实例实测才能写对，留待后续。
 */

const TIMEOUT_MS = 8000

async function getJson(url: string, token?: string): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: token ? { Authorization: token } : {} })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── 网易云 ──────────────────────────────────────────────────────────────────────────────────────────
async function neteaseAlbumTracks(
  base: string,
  token: string | undefined,
  artist: string,
  album: string,
): Promise<CanonicalTrack[] | null> {
  const keywords = `${album} ${artist}`.trim()
  const search = await getJson(`${base}/search?type=10&limit=5&keywords=${encodeURIComponent(keywords)}`, token)
  const albums: { id: number; name: string }[] = search?.result?.albums ?? []
  if (albums.length === 0) return null
  const want = normalizeName(album)
  const chosen = albums.find((a) => normalizeName(a.name) === want) ?? albums[0]!

  const detail = await getJson(`${base}/album?id=${chosen.id}`, token)
  const songs: { name: string; no?: number }[] = detail?.songs ?? []
  if (songs.length === 0) return null
  return songs.map((s) => ({ title: s.name, ...(typeof s.no === 'number' ? { trackNo: s.no } : {}) }))
}

async function neteaseArtistAlbums(
  base: string,
  token: string | undefined,
  artist: string,
): Promise<CanonicalAlbum[] | null> {
  const search = await getJson(`${base}/search?type=100&limit=5&keywords=${encodeURIComponent(artist)}`, token)
  const artists: { id: number; name: string }[] = search?.result?.artists ?? []
  if (artists.length === 0) return null
  const want = normalizeName(artist)
  const chosen = artists.find((a) => normalizeName(a.name) === want) ?? artists[0]!

  const detail = await getJson(`${base}/artist/album?id=${chosen.id}&limit=100`, token)
  const albums: { name: string; publishTime?: number }[] = detail?.hotAlbums ?? []
  if (albums.length === 0) return null
  // 去重（简繁/重复条目按归一化名）
  const seen = new Set<string>()
  const out: CanonicalAlbum[] = []
  for (const a of albums) {
    const key = normalizeName(a.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const year = a.publishTime ? new Date(a.publishTime).getFullYear() : undefined
    out.push({ name: a.name, ...(year && year > 1900 ? { year } : {}) })
  }
  return out
}

/** 取某专辑的规范曲目表（取不到返回 null） */
export async function fetchCanonicalAlbumTracks(artist: string, album: string): Promise<CanonicalTrack[] | null> {
  const config = getMusicInfoSource()
  const base = normalizeBaseUrl(config.baseUrl)
  if (config.type === 'none' || !base || !album.trim()) return null
  const token = config.token?.trim() || undefined
  try {
    if (config.type === 'netease') return await neteaseAlbumTracks(base, token, artist, album)
  } catch {
    return null
  }
  return null // qq 待接
}

/** 取某艺人的规范作品集（取不到返回 null） */
export async function fetchCanonicalArtistAlbums(artist: string): Promise<CanonicalAlbum[] | null> {
  const config = getMusicInfoSource()
  const base = normalizeBaseUrl(config.baseUrl)
  if (config.type === 'none' || !base || !artist.trim()) return null
  const token = config.token?.trim() || undefined
  try {
    if (config.type === 'netease') return await neteaseArtistAlbums(base, token, artist)
  } catch {
    return null
  }
  return null // qq 待接
}
