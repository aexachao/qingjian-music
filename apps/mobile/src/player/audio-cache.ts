import { Directory, File, Paths } from 'expo-file-system'
import type { HttpResource } from '@qj/core-domain'
import { type CacheEntry, cacheFileName, pickEvictions, totalBytes } from './audio-cache-policy'

/**
 * 播放缓存：听过的音频留在本地，下次直接从 file:// 起播。
 * 首版按方案约定「2GB 上限 + LRU 淘汰 + 不做下载管理 UI」，
 * 只在设置里给一个占用展示和清理入口。
 * 存在系统 Caches 目录：磁盘紧张时 iOS 可能自行回收，这对缓存是可接受的
 * （文件没了就回落到网络直连），所以不把它当「离线下载」承诺。
 */
const AUDIO_DIR = 'audio'
const INDEX_NAME = 'index.json'
/** 缓存上限 2GB */
export const AUDIO_CACHE_BUDGET_BYTES = 2 * 1024 * 1024 * 1024
/** 同时最多下几个，避免和正在播放的那首抢带宽 */
const MAX_PARALLEL_DOWNLOADS = 2
/** 索引写盘防抖 */
const FLUSH_DELAY_MS = 1_500

export interface AudioCacheTarget {
  serverId: string
  trackId: string
  format?: string
  sizeBytes?: number
}

interface CacheIndex {
  version: 1
  entries: Record<string, { size: number; lastUsedAt: number }>
}

let index: CacheIndex | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
const inflight = new Map<string, Promise<void>>()
/** 正在播放与马上要播的文件名，淘汰时必须跳过 */
let protectedNames: ReadonlySet<string> = new Set()
let cacheGeneration = 0

function audioDir(): Directory {
  const dir = new Directory(Paths.cache, AUDIO_DIR)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

function indexFile(): File {
  return new File(audioDir(), INDEX_NAME)
}

/** 文件时间戳有的平台给秒、有的给毫秒，统一成毫秒 */
function toMillis(value: number | null | undefined): number {
  if (!value || value <= 0) return 0
  return value < 1e12 ? value * 1000 : value
}

/** 以磁盘为准重建索引；已知的 lastUsedAt 取较新的那个，避免刚听过的被当成冷数据 */
function syncWithDisk(): CacheIndex {
  const entries: CacheIndex['entries'] = {}
  try {
    for (const item of audioDir().list()) {
      if (!(item instanceof File)) continue
      if (item.name === INDEX_NAME || item.name.endsWith('.part')) continue
      const known = index?.entries[item.name]
      entries[item.name] = {
        size: item.size ?? known?.size ?? 0,
        lastUsedAt: Math.max(known?.lastUsedAt ?? 0, toMillis(item.modificationTime) || Date.now()),
      }
    }
  } catch {
    // 目录读不了就当缓存为空
  }
  index = { version: 1, entries }
  return index
}

function loadIndex(): CacheIndex {
  if (index) return index
  try {
    const file = indexFile()
    if (file.exists) {
      const parsed = JSON.parse(file.textSync()) as CacheIndex | null
      if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        index = parsed
        return index
      }
    }
  } catch {
    // 索引坏了就按磁盘重建
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
    // 索引写失败只影响 LRU 精度，下次会用磁盘重建
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushIndex()
  }, FLUSH_DELAY_MS)
}

function entryList(current: CacheIndex): CacheEntry[] {
  return Object.entries(current.entries).map(([key, value]) => ({ key, ...value }))
}

/** 为了放进 incomingBytes 腾地方，删掉最久未用的（受保护的除外） */
function evictFor(incomingBytes: number, protect: string): void {
  const current = loadIndex()
  const keep = new Set<string>([protect, ...protectedNames, ...inflight.keys()])
  const victims = pickEvictions(entryList(current), AUDIO_CACHE_BUDGET_BYTES, incomingBytes, keep)
  if (victims.length === 0) return
  for (const name of victims) {
    try {
      const file = new File(audioDir(), name)
      if (file.exists) file.delete()
    } catch {
      // 删不掉就留着，下次再试
    }
    delete current.entries[name]
  }
  scheduleFlush()
}

/** 命中缓存返回 file:// 地址，同时刷新 LRU 时间戳 */
export function cachedAudioUri(target: AudioCacheTarget): string | undefined {
  const name = cacheFileName(target.serverId, target.trackId, target.format)
  try {
    const file = new File(audioDir(), name)
    if (!file.exists) return undefined
    const current = loadIndex()
    current.entries[name] = { size: file.size ?? current.entries[name]?.size ?? 0, lastUsedAt: Date.now() }
    scheduleFlush()
    return file.uri
  } catch {
    return undefined
  }
}

/** 告诉缓存「这几首正在播 / 马上要播」，淘汰时会跳过它们 */
export function protectTracks(targets: AudioCacheTarget[]): void {
  protectedNames = new Set(targets.map((item) => cacheFileName(item.serverId, item.trackId, item.format)))
}

/**
 * 把音频存进缓存。已缓存、正在下载、并发满了都直接跳过；
 * 任何失败都只 warn——缓存是加速手段，不该影响播放。
 */
export async function cacheAudio(target: AudioCacheTarget, resource: HttpResource): Promise<void> {
  const name = cacheFileName(target.serverId, target.trackId, target.format)
  const running = inflight.get(name)
  if (running) return running
  if (inflight.size >= MAX_PARALLEL_DOWNLOADS) return

  const task = (async () => {
    const generation = cacheGeneration
    const dir = audioDir()
    const final = new File(dir, name)
    if (final.exists) return
    const part = new File(dir, `${name}.part`)
    try {
      if (part.exists) part.delete()
      const downloaded = await File.downloadFileAsync(resource.url, part, { headers: resource.headers })
      if (generation !== cacheGeneration) {
        if (downloaded.exists) downloaded.delete()
        return
      }
      const size = downloaded.size ?? target.sizeBytes ?? 0
      evictFor(size, name)
      if (final.exists) {
        downloaded.delete()
        return
      }
      await downloaded.move(final)
      const current = loadIndex()
      current.entries[name] = { size, lastUsedAt: Date.now() }
      scheduleFlush()
    } catch (error) {
      try {
        if (part.exists) part.delete()
      } catch {
        // 清理临时文件失败无所谓
      }
      console.warn('音频缓存失败', error)
    }
  })()

  inflight.set(name, task)
  try {
    await task
  } finally {
    inflight.delete(name)
  }
}

/** 设置页展示用：以磁盘为准统计 */
export function audioCacheStats(): { bytes: number; files: number; budgetBytes: number } {
  const current = syncWithDisk()
  const entries = entryList(current)
  scheduleFlush()
  return { bytes: totalBytes(entries), files: entries.length, budgetBytes: AUDIO_CACHE_BUDGET_BYTES }
}

/** 设置页「清理音频缓存」 */
export function clearAudioCache(): void {
  cacheGeneration += 1
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    const dir = new Directory(Paths.cache, AUDIO_DIR)
    if (dir.exists) dir.delete()
  } catch {
    // 目录删不掉就算了
  }
  index = { version: 1, entries: {} }
}
