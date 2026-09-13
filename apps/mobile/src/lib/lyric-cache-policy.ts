/**
 * 歌词缓存的纯逻辑：键名、文件名、按首数淘汰。刻意不 import expo-file-system，
 * 单测才能直接跑（与 `player/audio-cache-policy.ts` 同一套做法）。
 *
 * 为什么要「档位入文件名」：一首歌在服务端可能有逐字 / 整行 / 纯文本多个版本，
 * 缓存也要按版本分别存。文件名带档位后，不读文件内容就能判断本地有哪些版本，
 * 也方便按「逐字 > 整行 > 纯文本」的优先级挑本地最好的一份。
 */
import type { LyricTier } from '@qj/core-domain'

/** 档位优先级：逐字 > 整行 > 纯文本。遍历它即为「择优顺序」 */
export const LYRIC_TIER_ORDER: readonly LyricTier[] = ['word', 'line', 'plain']

export interface LyricCacheRecord {
  tier: LyricTier
  /** 服务端歌词条目 id；写回偏移时必须带上 */
  lyricId?: string
  /** 服务端保存的时间偏移（毫秒） */
  offsetMs: number
  /** 首次写入时间（毫秒时间戳） */
  fetchedAt: number
  /** 最近一次命中时间，LRU 淘汰用 */
  lastUsedAt: number
}

/** 缓存键：一份歌词由「服务器 + 曲目 + 档位」唯一确定 */
export function lyricCacheKey(serverId: string, trackId: string, tier: LyricTier): string {
  return `${serverId}__${trackId}__${tier}`
}

/** 文件名沿用键名 + .json（内容是序列化后的 LyricSheet） */
export function lyricCacheFileName(serverId: string, trackId: string, tier: LyricTier): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${safe(serverId)}__${safe(trackId)}__${tier}.json`
}

/** 从文件名还原键与档位（索引损坏时按磁盘重建用） */
export function parseLyricCacheFileName(name: string): { key: string; tier: LyricTier } | null {
  if (!name.endsWith('.json') || name === 'index.json') return null
  const stem = name.slice(0, -'.json'.length)
  const tier = LYRIC_TIER_ORDER.find((candidate) => stem.endsWith(`__${candidate}`))
  return tier ? { key: stem, tier } : null
}

/** 按「最久未用先删」挑出超过首数上限的键；countLimit <= 0 表示不限制 */
export function pickLyricEvictions(
  entries: { key: string; lastUsedAt: number }[],
  countLimit: number,
): string[] {
  if (countLimit <= 0 || entries.length <= countLimit) return []
  return [...entries]
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    .slice(0, entries.length - countLimit)
    .map((entry) => entry.key)
}
