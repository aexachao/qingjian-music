import type { Track } from '@qj/core-domain'

export const LASTFM_API_KEY = 'ed1d0f7bcdc4fbfaa008617438943a32'
const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/'

export interface LastFmTrack {
  name: string
  playcount?: string
  listeners?: string
}

export interface LastFmArtistInfo {
  name: string
  bioSummary?: string
  tags: string[]
  listeners?: string
  playcount?: string
}

export interface LastFmSimilarArtist {
  name: string
  match: number
}

/**
 * 字符串清洗函数：去除版本信息括号、标点与空格，便于全网歌名与 NAS 本地文件名进行高容错匹配。
 */
export function cleanSongTitle(title: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/\s*[\(\[\{（【][^\)\]\}）】]*[\)\]\}）】]/g, '') // 移除各类括号及其内容（如 (Live)、[FLAC]、(伴奏) 等）
    .replace(/[,\.·!?:'"`~\-_/\\|\s]/g, '') // 移除常见标点符号与空白
    .trim()
}

/**
 * 获取艺人全网热门歌曲列表
 */
export async function fetchArtistTopTracks(artistName: string, limit = 20): Promise<LastFmTrack[]> {
  if (!artistName) return []
  try {
    const url = new URL(LASTFM_BASE_URL)
    url.searchParams.set('method', 'artist.gettoptracks')
    url.searchParams.set('artist', artistName)
    url.searchParams.set('api_key', LASTFM_API_KEY)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', String(limit))

    const response = await fetch(url.toString())
    if (!response.ok) return []
    const data = (await response.json()) as {
      toptracks?: {
        track?: {
          name: string
          playcount?: string
          listeners?: string
        }[]
      }
    }

    const rawList = data.toptracks?.track
    if (!Array.isArray(rawList)) return []

    return rawList.map((t) => ({
      name: t.name,
      playcount: t.playcount,
      listeners: t.listeners,
    }))
  } catch {
    return []
  }
}

/**
 * 获取艺人生平档案（Bio）与风格标签（设置 lang=zh 支持中文百科）
 */
export async function fetchArtistInfo(artistName: string): Promise<LastFmArtistInfo | null> {
  if (!artistName) return null
  try {
    const url = new URL(LASTFM_BASE_URL)
    url.searchParams.set('method', 'artist.getinfo')
    url.searchParams.set('artist', artistName)
    url.searchParams.set('api_key', LASTFM_API_KEY)
    url.searchParams.set('format', 'json')
    url.searchParams.set('lang', 'zh')
    url.searchParams.set('autocorrect', '1')

    const response = await fetch(url.toString())
    if (!response.ok) return null
    const data = (await response.json()) as {
      artist?: {
        name: string
        bio?: { summary?: string; content?: string }
        tags?: { tag?: { name: string }[] }
        stats?: { listeners?: string; playcount?: string }
      }
    }

    const artist = data.artist
    if (!artist) return null

    // 清理 Last.fm 的 `<a href="...">Read more on Last.fm</a>` 与版权附注
    let bioText = artist.bio?.summary || artist.bio?.content || ''
    bioText = bioText
      .replace(/<a\b[^>]*>.*?<\/a>/gi, '')
      .replace(/User-contributed text is available under the Creative Commons.*?$/gi, '')
      .trim()

    const tags = Array.isArray(artist.tags?.tag) ? artist.tags.tag.map((t) => t.name).filter(Boolean) : []

    return {
      name: artist.name,
      bioSummary: bioText,
      tags,
      listeners: artist.stats?.listeners,
      playcount: artist.stats?.playcount,
    }
  } catch {
    return null
  }
}

/**
 * 获取相似艺人列表
 */
export async function fetchSimilarArtists(artistName: string, limit = 10): Promise<LastFmSimilarArtist[]> {
  if (!artistName) return []
  try {
    const url = new URL(LASTFM_BASE_URL)
    url.searchParams.set('method', 'artist.getsimilar')
    url.searchParams.set('artist', artistName)
    url.searchParams.set('api_key', LASTFM_API_KEY)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', String(limit))

    const response = await fetch(url.toString())
    if (!response.ok) return []
    const data = (await response.json()) as {
      similarartists?: {
        artist?: {
          name: string
          match: string
        }[]
      }
    }

    const rawList = data.similarartists?.artist
    if (!Array.isArray(rawList)) return []

    return rawList.map((a) => ({
      name: a.name,
      match: Number.parseFloat(a.match) || 0,
    }))
  } catch {
    return []
  }
}

/**
 * 获取艺人高分辨率官方写真（优先 Deezer 1000x1000 超清写真，降级维基百科）
 * 专为解决私有 NAS 曲库普遍缺乏歌手宽画幅高清写真的硬伤，自动并发检索官方摄影大片。
 */
export async function fetchArtistPortrait(artistName: string): Promise<string | null> {
  if (!artistName) return null
  const cleanName = artistName.trim()
  if (!cleanName) return null

  // 1. 优先使用 Deezer 开放音乐大数据库（1000x1000 超清写真，无 429 频控限制）
  try {
    const deezerUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanName)}&limit=1`
    const res = await fetch(deezerUrl)
    if (res.ok) {
      const data = (await res.json()) as {
        data?: {
          name?: string
          picture_xl?: string
          picture_big?: string
          picture_medium?: string
        }[]
      }
      const first = data.data?.[0]
      const pic = first?.picture_xl ?? first?.picture_big ?? first?.picture_medium
      if (pic) return pic
    }
  } catch {
    // 降级尝试维基百科
  }

  // 2. 尝试中文维基百科
  try {
    const zhUrl = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`
    const res = await fetch(zhUrl, {
      headers: { 'User-Agent': 'QingjianMusic/1.0 (https://github.com/qingjian-music; contact@example.com)' },
    })
    if (res.ok) {
      const data = (await res.json()) as {
        originalimage?: { source?: string }
        thumbnail?: { source?: string }
      }
      const src = data.originalimage?.source ?? data.thumbnail?.source
      if (src) return src
    }
  } catch {
    // 降级至英文
  }

  // 3. 尝试英文维基百科
  try {
    const enUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`
    const res = await fetch(enUrl, {
      headers: { 'User-Agent': 'QingjianMusic/1.0 (https://github.com/qingjian-music; contact@example.com)' },
    })
    if (res.ok) {
      const data = (await res.json()) as {
        originalimage?: { source?: string }
        thumbnail?: { source?: string }
      }
      const src = data.originalimage?.source ?? data.thumbnail?.source
      if (src) return src
    }
  } catch {
    // 忽略异常，返回 null 降级至本地唱片封面
  }

  return null
}


/**
 * 智能模糊对齐算法：
 * 将 Last.fm 全网 Top 歌曲名称列表与当前 NAS 本地曲目进行高命中对齐，
 * 依次筛选出排在前列且本地确实拥有的歌曲；若命中不足 maxCount 首，
 * 则自动用本地收藏（isFavorite）或首批曲目顺延补齐，保证永远能凑齐优质首屏体验。
 */
export function matchLocalTracks(
  localTracks: Track[],
  topTracks: LastFmTrack[],
  maxCount = 5,
): Track[] {
  if (localTracks.length === 0) return []
  if (localTracks.length <= maxCount && topTracks.length === 0) return localTracks

  const matched: Track[] = []
  const usedIds = new Set<string>()

  // 1. 根据全网热榜排位逐个在本地曲目中寻找匹配
  for (const top of topTracks) {
    if (matched.length >= maxCount) break
    const cleanTop = cleanSongTitle(top.name)
    if (!cleanTop) continue

    // 优先精确匹配
    let found = localTracks.find(
      (t) => !usedIds.has(t.id) && cleanSongTitle(t.title) === cleanTop,
    )

    // 其次包含匹配（长度至少 2 字符）
    if (!found && cleanTop.length >= 2) {
      found = localTracks.find((t) => {
        if (usedIds.has(t.id)) return false
        const cleanLocal = cleanSongTitle(t.title)
        return (
          cleanLocal.length >= 2 &&
          (cleanLocal.includes(cleanTop) || cleanTop.includes(cleanLocal))
        )
      })
    }

    if (found) {
      matched.push(found)
      usedIds.add(found.id)
    }
  }

  // 2. 如果全网匹配结果不足 maxCount 首（例如部分热歌用户未收藏或离线断网），
  //    优先用本地标记为收藏（isFavorite=true）的歌曲补齐
  if (matched.length < maxCount) {
    for (const track of localTracks) {
      if (matched.length >= maxCount) break
      if (!usedIds.has(track.id) && track.isFavorite) {
        matched.push(track)
        usedIds.add(track.id)
      }
    }
  }

  // 3. 若仍不足，用剩余曲目顺序补齐
  if (matched.length < maxCount) {
    for (const track of localTracks) {
      if (matched.length >= maxCount) break
      if (!usedIds.has(track.id)) {
        matched.push(track)
        usedIds.add(track.id)
      }
    }
  }

  return matched
}
