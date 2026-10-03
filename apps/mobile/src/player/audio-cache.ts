import { Directory, File, Paths } from 'expo-file-system'
import type { HttpResource } from '@qj/core-domain'
import {
  getCurrentCacheBudgetBytes,
  getCurrentCacheCountLimit,
  isAutoCacheEnabled,
  registerCacheLimitEnforcer,
} from '@/lib/cache-preferences'
import { type CacheEntry, cacheFileName, pickEvictions, totalBytes } from './audio-cache-policy'

/**
 * 播放缓存：听过的音频留在本地，下次直接从 file:// 起播。
 * 存在系统 Caches 目录：磁盘紧张时 iOS 可能自行回收，这对缓存是可接受的
 * （文件没了就回落到网络直连），所以不把它当「离线下载」承诺。
 */
const AUDIO_DIR = 'audio'
const INDEX_NAME = 'index.json'
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
const inflightControllers = new Map<string, AbortController>()
const reservations = new Map<string, number>()
/** 正在播放与马上要播的文件名，淘汰时必须跳过 */
let protectedNames: ReadonlySet<string> = new Set()
let cacheGeneration = 0

/** Captured before resource resolution so a clear can invalidate later cache work too. */
export function captureAudioCacheGeneration(): number {
  return cacheGeneration
}

export function isAudioCacheGenerationCurrent(generation: number): boolean {
  return generation === cacheGeneration
}

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
function evictFor(incomingBytes: number, protect: string): boolean {
  if (!Number.isFinite(incomingBytes) || incomingBytes < 0) return false
  const current = loadIndex()
  const keep = new Set<string>([protect, ...protectedNames, ...inflight.keys()])
  const budget = getCurrentCacheBudgetBytes()
  const countLimit = getCurrentCacheCountLimit()
  const otherReservations = [...reservations.entries()]
    .filter(([name]) => name !== protect)
    .reduce((sum, [, size]) => sum + size, 0)
  const currentEntries = entryList(current)
  const existingEntry = current.entries[protect]
  const nextReservation = Math.max(0, incomingBytes)
  const projectedIncoming = otherReservations + nextReservation
  const reservationNames = new Set([...reservations.keys()].filter((name) => name !== protect))
  const fixedNames = new Set([
    ...currentEntries.filter((entry) => keep.has(entry.key)).map((entry) => entry.key),
    ...reservationNames,
  ])
  if (nextReservation > 0 && !existingEntry) fixedNames.add(protect)

  // Reject impossible admissions before evicting any useful cache file.
  const protectedEntries = currentEntries.filter((entry) => keep.has(entry.key))
  const protectedBytes = totalBytes(protectedEntries) + otherReservations + nextReservation
  if ((budget > 0 && protectedBytes > budget) || (countLimit > 0 && fixedNames.size > countLimit)) {
    return false
  }

  const victims = pickEvictions(currentEntries, budget, projectedIncoming, keep, countLimit)
  const victimNames = new Set(victims)
  if (countLimit > 0) {
    const names = new Set(currentEntries.filter((entry) => !victimNames.has(entry.key)).map((entry) => entry.key))
    for (const name of reservationNames) names.add(name)
    if (nextReservation > 0) names.add(protect)
    for (const candidate of currentEntries.filter((entry) => !keep.has(entry.key)).sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
      if (names.size <= countLimit) break
      if (victimNames.has(candidate.key)) continue
      victimNames.add(candidate.key)
      names.delete(candidate.key)
    }
  }
  const plannedVictims = [...victimNames]
  const theoreticalBytes = totalBytes(currentEntries.filter((entry) => !victimNames.has(entry.key))) + projectedIncoming
  const theoreticalNames = new Set(currentEntries.filter((entry) => !victimNames.has(entry.key)).map((entry) => entry.key))
  for (const name of reservationNames) theoreticalNames.add(name)
  if (nextReservation > 0) theoreticalNames.add(protect)
  const theoreticalCount = theoreticalNames.size
  if ((budget > 0 && theoreticalBytes > budget) || (countLimit > 0 && theoreticalCount > countLimit)) return false

  for (const name of plannedVictims) {
    let deleted = false
    try {
      const file = new File(audioDir(), name)
      if (file.exists) file.delete()
      deleted = !file.exists
    } catch {
      // 删不掉就保留索引与统计，下次再试
    }
    if (deleted) delete current.entries[name]
  }
  if (plannedVictims.length > 0) scheduleFlush()

  const projectedBytes = totalBytes(entryList(current)) + projectedIncoming
  const actualNames = new Set([...Object.keys(current.entries), ...reservationNames])
  if (nextReservation > 0) actualNames.add(protect)
  const actualCount = actualNames.size
  const withinBudget = budget <= 0 || projectedBytes <= budget
  const withinCount = countLimit <= 0 || actualCount <= countLimit
  if (!withinBudget || !withinCount) return false
  reservations.set(protect, nextReservation)
  return true
}

/** Release an in-flight byte reservation once its temporary file is gone or committed. */
export function releaseCacheSpace(name: string): void {
  reservations.delete(name)
}

/** 主动应用当前配额与首数上限（用户在设置里调小容量或限制首数时调用） */
export function enforceCacheLimits(): void {
  const current = loadIndex()
  const keep = new Set<string>([...protectedNames, ...inflight.keys()])
  const budget = getCurrentCacheBudgetBytes()
  const countLimit = getCurrentCacheCountLimit()
  const victims = pickEvictions(entryList(current), budget, 0, keep, countLimit)
  if (victims.length === 0) return
  for (const name of victims) {
    let deleted = false
    try {
      const file = new File(audioDir(), name)
      if (file.exists) file.delete()
      deleted = !file.exists
    } catch {
      // 删除失败时保留索引与统计，下次再试
    }
    if (deleted) delete current.entries[name]
  }
  scheduleFlush()
}

registerCacheLimitEnforcer(enforceCacheLimits)

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
  // 用户在设置中关闭了自动缓存时，绝对不写入本地磁盘
  if (!isAutoCacheEnabled()) return

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
    const controller = new AbortController()
    inflightControllers.set(name, controller)
    try {
      if (part.exists) part.delete()
      if (target.sizeBytes && !reserveCacheSpace(target.sizeBytes, name)) return
      const downloaded = await File.downloadFileAsync(resource.url, part, {
        headers: resource.headers,
        signal: controller.signal,
        onProgress: ({ bytesWritten }) => {
          if (!reserveCacheSpace(bytesWritten, name)) controller.abort()
        },
      })
      if (generation !== cacheGeneration) {
        if (downloaded.exists) downloaded.delete()
        return
      }
      const size = downloaded.size ?? target.sizeBytes ?? 0
      if (!isAutoCacheEnabled() || !reserveCacheSpace(size, name) || generation !== cacheGeneration) {
        downloaded.delete()
        return
      }
      await downloaded.move(final)
      if (generation !== cacheGeneration || !isAutoCacheEnabled() || !registerCacheEntry(name, size)) {
        try {
          if (final.exists) final.delete()
        } catch {
          // 清理失败时下次按磁盘重建索引
        }
      }
    } catch (error) {
      try {
        if (part.exists) part.delete()
      } catch {
        // 清理临时文件失败无所谓
      }
      console.warn('音频缓存失败', error)
    } finally {
      inflightControllers.delete(name)
      releaseCacheSpace(name)
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
  return { bytes: totalBytes(entries), files: entries.length, budgetBytes: getCurrentCacheBudgetBytes() }
}

/** Cancel automatic transfers while retaining completed cache entries. */
export function abortAudioCaching(): void {
  cacheGeneration += 1
  for (const controller of inflightControllers.values()) controller.abort()
}

/** 设置页「清理音频缓存」 */
export function clearAudioCache(): boolean {
  cacheGeneration += 1
  for (const controller of inflightControllers.values()) controller.abort()
  reservations.clear()
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    const dir = new Directory(Paths.cache, AUDIO_DIR)
    if (dir.exists) dir.delete()
    if (dir.exists) throw new Error('Audio cache directory remains after delete')
  } catch {
    // 保留真实索引，设置页可反馈删除失败。
    index = null
    return false
  }
  index = { version: 1, entries: {} }
  return true
}

// ── 给「转码产物缓存」用的窄接口 ─────────────────────────────────────────────
//
// 转码产物（服务端 HLS 拼接出的单文件）的下载逻辑在 `transcode-cache.ts`：
// 它要按分片流式追加写入，用不了这里 `cacheAudio` 的单 URL 下载。
// 但**索引、LRU、配额、淘汰必须复用本模块**，否则两套缓存互相看不见对方的占用，
// 「上限 2GB」就形同虚设。

/** 为即将写入的 bytes 腾出空间（受保护的条目与正在下载的不会被删） */
export function reserveCacheSpace(bytes: number, protectName: string): boolean {
  return evictFor(bytes, protectName)
}

/** 文件已落盘后登记进索引并刷新 LRU */
export function registerCacheEntry(name: string, size: number): boolean {
  const current = loadIndex()
  const previous = current.entries[name]
  // The final file may replace a stale index entry. Do not count that old
  // size against the new admission decision.
  if (previous) delete current.entries[name]
  const reservation = reservations.get(name) ?? 0
  if (!evictFor(Math.max(size, reservation), name)) {
    if (previous) current.entries[name] = previous
    return false
  }
  current.entries[name] = { size, lastUsedAt: Date.now() }
  scheduleFlush()
  return true
}

/** 丢弃一个缓存条目（转码产物校验失败、或播放失败需要作废时用） */
export function removeCacheEntry(name: string): void {
  const current = loadIndex()
  let deleted = false
  try {
    const file = new File(audioDir(), name)
    if (file.exists) file.delete()
    deleted = !file.exists
  } catch {
    // Keep the index entry if the file could not be deleted.
  }
  if (deleted) {
    delete current.entries[name]
    releaseCacheSpace(name)
    scheduleFlush()
  }
}

/**
 * 按**缓存文件名**直接取 uri（命中时刷新 LRU）。
 * 转码产物用的是 `transcodeCacheFileName()`，与原始文件的命名不同，
 * 所以不能走 `cachedAudioUri(target)`。
 */
export function cachedUriByName(name: string): string | undefined {
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

/** 缓存目录（转码产物要写进同一个目录，才能被同一套配额管到） */
export function cacheAudioDirectory(): Directory {
  return audioDir()
}
