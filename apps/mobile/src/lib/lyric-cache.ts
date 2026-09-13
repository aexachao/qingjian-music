import { Directory, File, Paths } from 'expo-file-system'
import type { LyricSheet } from '@qj/core-domain'
import {
  LYRIC_TIER_ORDER,
  lyricCacheFileName,
  lyricCacheKey,
  parseLyricCacheFileName,
  pickLyricEvictions,
  type LyricCacheRecord,
} from './lyric-cache-policy'

/**
 * 本地歌词缓存：命中的歌词不再发请求，断网时也能显示。
 *
 * 存在系统 Caches 目录（与播放缓存同层）：歌词丢了回落到网络即可，
 * 不需要 Documents 那种「系统不回收」的保证，也就不必进真离线那套管理。
 *
 * 与播放缓存的两点差异：
 * 1. 歌词文件只有几 KB，所以按**首数**上限淘汰，不按体积；
 * 2. 一首歌可能有多个档位（逐字 / 整行 / 纯文本），**档位进文件名**，
 *    这样按「逐字 > 整行 > 纯文本」找本地时不必读文件内容。
 */
const LYRIC_DIR = 'lyrics'
const INDEX_NAME = 'index.json'
/** 歌词极小，2000 首量级约 20MB，够用且不会失控 */
const LYRIC_COUNT_LIMIT = 2000
/** 索引写盘防抖 */
const FLUSH_DELAY_MS = 1_500

interface LyricCacheIndex {
  version: 1
  entries: Record<string, LyricCacheRecord>
}

let index: LyricCacheIndex | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null

function lyricDir(): Directory {
  const dir = new Directory(Paths.cache, LYRIC_DIR)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

function indexFile(): File {
  return new File(lyricDir(), INDEX_NAME)
}

/** 以磁盘为准重建索引：文件在就是有缓存，lastUsedAt 取已知值与文件时间的较新者 */
function syncWithDisk(): LyricCacheIndex {
  const entries: LyricCacheIndex['entries'] = {}
  try {
    for (const item of lyricDir().list()) {
      if (!(item instanceof File)) continue
      const parsed = parseLyricCacheFileName(item.name)
      if (!parsed) continue
      const known = index?.entries[parsed.key]
      entries[parsed.key] = known ?? {
        tier: parsed.tier,
        offsetMs: 0,
        fetchedAt: 0,
        lastUsedAt: Date.now(),
      }
    }
  } catch {
    // 目录读不了就当缓存为空
  }
  index = { version: 1, entries }
  return index
}

function loadIndex(): LyricCacheIndex {
  if (index) return index
  try {
    const file = indexFile()
    if (file.exists) {
      const parsed = JSON.parse(file.textSync()) as LyricCacheIndex | null
      if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        index = parsed
        return index
      }
    }
  } catch {
    // 索引坏了按磁盘重建
  }
  return syncWithDisk()
}

function flushIndex(): void {
  if (!index) return
  try {
    const file = indexFile()
    if (!file.exists) file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify(index))
  } catch {
    // 写失败只影响 LRU 精度，下次会用磁盘重建
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushIndex()
  }, FLUSH_DELAY_MS)
}

/** 按首数上限淘汰最久未用的歌词 */
function evictIfNeeded(): void {
  const current = loadIndex()
  const entries = Object.entries(current.entries).map(([key, value]) => ({ key, lastUsedAt: value.lastUsedAt }))
  const victims = pickLyricEvictions(entries, LYRIC_COUNT_LIMIT)
  if (victims.length === 0) return
  for (const key of victims) {
    const record = current.entries[key]
    if (record) {
      try {
        const file = new File(lyricDir(), lyricCacheFileName(...splitKey(key), record.tier))
        if (file.exists) file.delete()
      } catch {
        // 删不掉就留着，下次再试
      }
    }
    delete current.entries[key]
  }
  scheduleFlush()
}

/** 键的形态是 `serverId__trackId__tier`，serverId / trackId 本身不含 `__` */
function splitKey(key: string): [string, string] {
  const parts = key.split('__')
  return [parts[0] ?? '', parts[1] ?? '']
}

/**
 * 读本地歌词：按「逐字 > 整行 > 纯文本」取最好的一份。
 * 命中即刷新 LRU 时间戳；文件损坏时顺手清掉这条索引。
 */
export function readCachedLyric(serverId: string, trackId: string): LyricSheet | null {
  let current: LyricCacheIndex
  try {
    current = loadIndex()
  } catch {
    return null
  }
  for (const tier of LYRIC_TIER_ORDER) {
    const key = lyricCacheKey(serverId, trackId, tier)
    if (!current.entries[key]) continue
    try {
      const file = new File(lyricDir(), lyricCacheFileName(serverId, trackId, tier))
      if (!file.exists) {
        delete current.entries[key]
        scheduleFlush()
        continue
      }
      const sheet = JSON.parse(file.textSync()) as LyricSheet
      if (!sheet || !Array.isArray(sheet.lines)) throw new Error('歌词缓存结构不对')
      current.entries[key] = { ...current.entries[key]!, lastUsedAt: Date.now() }
      scheduleFlush()
      return sheet
    } catch {
      // 单条坏了就跳过并清掉，不影响其它档位
      delete current.entries[key]
      scheduleFlush()
    }
  }
  return null
}

/** 写回本地。只缓存服务端选中的那一份（备选版本的内容当前不落盘，见文档说明） */
export function writeCachedLyric(serverId: string, trackId: string, sheet: LyricSheet): void {
  try {
    const file = new File(lyricDir(), lyricCacheFileName(serverId, trackId, sheet.tier))
    if (!file.exists) file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify(sheet))
    const current = loadIndex()
    const now = Date.now()
    current.entries[lyricCacheKey(serverId, trackId, sheet.tier)] = {
      tier: sheet.tier,
      ...(sheet.id ? { lyricId: sheet.id } : {}),
      offsetMs: sheet.offsetMs,
      fetchedAt: now,
      lastUsedAt: now,
    }
    evictIfNeeded()
    scheduleFlush()
  } catch {
    // 缓存写失败不影响歌词显示
  }
}

/** 清空全部歌词缓存（设置页用）。返回清掉的文件数 */
export function clearLyricCache(): number {
  let removed = 0
  try {
    const dir = lyricDir()
    for (const item of dir.list()) {
      if (!(item instanceof File)) continue
      if (item.name === INDEX_NAME) continue
      try {
        item.delete()
        removed += 1
      } catch {
        // 忽略单个删除失败
      }
    }
  } catch {
    // 目录读不了就当作已清空
  }
  index = { version: 1, entries: {} }
  flushIndex()
  return removed
}

/** 设置页展示用：当前缓存了多少首歌的歌词 */
export function lyricCacheStats(): { files: number } {
  try {
    return { files: Object.keys(loadIndex().entries).length }
  } catch {
    return { files: 0 }
  }
}
