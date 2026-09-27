import type { LyricSheet } from '@qj/core-domain'
import { lyricTier, parseLrc, parseYrc } from '@qj/core-domain'
import { getLyricsSource, normalizeBaseUrl } from '@/lib/external-source'

/**
 * 外部歌词源适配器：把用户自填的国内服务(网易云 yrc / LrcAPI)取回并解析成 LyricSheet。
 *
 * - 网易云:search 找 id → lyric/new 取 yrc(逐字)优先、lrc(行级)兜底 → 解析。
 * - LrcAPI:/lyrics?title=&artist= 直接拿标准 LRC 文本 → 行级。
 * 只在飞牛歌词缺失或非逐字时才有意义(择优逻辑在 loadLyricSheet 里)。
 */

export interface LyricQueryMeta {
  title?: string
  artist?: string
  album?: string
}

const TIMEOUT_MS = 8000

async function getJson(url: string, token?: string): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: token ? { Authorization: token } : {},
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getText(url: string, token?: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: token ? { Authorization: token } : {},
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function cleanTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[（(【\[].*?[)）】\]]/g, '')
    .replace(/[\s·・.,'"!?！？]/g, '')
    .trim()
}

// ── 网易云(yrc 逐字) ──────────────────────────────────────────────────────
async function fetchNetease(base: string, token: string | undefined, meta: LyricQueryMeta): Promise<LyricSheet | null> {
  const title = (meta.title ?? '').trim()
  if (!title) return null
  const keywords = `${title} ${meta.artist ?? ''}`.trim()
  const search = (await getJson(
    `${base}/search?type=1&limit=5&keywords=${encodeURIComponent(keywords)}`,
    token,
  )) as { result?: { songs?: { id: number; name: string }[] } } | null
  const songs = search?.result?.songs ?? []
  if (songs.length === 0) return null

  const wantClean = cleanTitle(title)
  const chosen = songs.find((s) => cleanTitle(s.name) === wantClean) ?? songs[0]!

  const lyric = (await getJson(`${base}/lyric/new?id=${chosen.id}`, token)) as
    | { yrc?: { lyric?: string }; lrc?: { lyric?: string } }
    | null
  if (!lyric) return null

  const yrc = lyric.yrc?.lyric ?? ''
  const lrc = lyric.lrc?.lyric ?? ''

  const wordLines = yrc ? parseYrc(yrc) : []
  if (wordLines.length > 0) {
    return {
      synced: true,
      lines: wordLines,
      offsetMs: 0,
      tier: 'word',
      source: '网易云 · 逐字',
      raw: yrc,
    }
  }
  const lineLines = lrc ? parseLrc(lrc) : []
  if (lineLines.length > 0) {
    return {
      synced: true,
      lines: lineLines,
      offsetMs: 0,
      tier: lyricTier({ lines: lineLines, synced: true }),
      source: '网易云',
      raw: lrc,
    }
  }
  return null
}

// ── LrcAPI(行级) ─────────────────────────────────────────────────────────
async function fetchLrcApi(base: string, token: string | undefined, meta: LyricQueryMeta): Promise<LyricSheet | null> {
  const title = (meta.title ?? '').trim()
  if (!title) return null
  const params = new URLSearchParams()
  params.set('title', title)
  if (meta.artist) params.set('artist', meta.artist)
  if (meta.album) params.set('album', meta.album)
  const text = await getText(`${base}/lyrics?${params.toString()}`, token)
  if (!text) return null
  const lines = parseLrc(text)
  if (lines.length === 0) return null
  return {
    synced: true,
    lines,
    offsetMs: 0,
    tier: lyricTier({ lines, synced: true }),
    source: 'LrcAPI',
    raw: text,
  }
}

/** 按用户配置的歌词源取一份歌词(取不到返回 null)。 */
export async function fetchExternalLyricSheet(meta: LyricQueryMeta): Promise<LyricSheet | null> {
  const config = getLyricsSource()
  const base = normalizeBaseUrl(config.baseUrl)
  if (config.type === 'none' || !base) return null
  const token = config.token?.trim() || undefined
  try {
    if (config.type === 'netease') return await fetchNetease(base, token, meta)
    if (config.type === 'lrcapi') return await fetchLrcApi(base, token, meta)
  } catch {
    return null
  }
  return null
}
