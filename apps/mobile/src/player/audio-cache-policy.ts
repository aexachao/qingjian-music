/**
 * 播放缓存的纯逻辑：文件名、contentType、LRU 淘汰挑选、体积展示。
 * 这里刻意不 import expo-file-system，单测才能直接跑。
 */

export interface CacheEntry {
  key: string
  size: number
  /** 最近一次被播放/命中的时间（毫秒时间戳） */
  lastUsedAt: number
}

/** 后缀只允许小写字母数字，未知格式统一用 audio */
export function safeExtension(format?: string): string {
  const cleaned = (format ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned.length > 0 && cleaned.length <= 5 ? cleaned : 'audio'
}

/** 缓存文件名：服务器 id + 曲目 id + 真实后缀（AVPlayer 靠后缀判断容器） */
export function cacheFileName(serverId: string, trackId: string, format?: string): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${safe(serverId)}_${safe(trackId)}.${safeExtension(format)}`
}

const CONTENT_TYPES: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  alac: 'audio/mp4',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
}

export function contentTypeFor(format?: string): string | undefined {
  return CONTENT_TYPES[safeExtension(format)]
}

export function totalBytes(entries: CacheEntry[]): number {
  return entries.reduce((sum, entry) => sum + Math.max(0, entry.size), 0)
}

/**
 * 挑出为了容纳 incomingBytes 需要删掉的条目（最久未用的先删）。
 * protectedKeys 里的条目绝不删：正在播放的那首、以及队列里马上要播的几首。
 */
export function pickEvictions(
  entries: CacheEntry[],
  budgetBytes: number,
  incomingBytes: number,
  protectedKeys: ReadonlySet<string> = new Set(),
): string[] {
  let over = totalBytes(entries) + Math.max(0, incomingBytes) - budgetBytes
  if (over <= 0) return []
  const victims: string[] = []
  const candidates = entries
    .filter((entry) => !protectedKeys.has(entry.key))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
  for (const entry of candidates) {
    victims.push(entry.key)
    over -= Math.max(0, entry.size)
    if (over <= 0) break
  }
  return victims
}

/** 给设置页展示：1.5 GB / 820 MB 这种 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1024 ** 2
  if (mb >= 1) return `${Math.round(mb)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
