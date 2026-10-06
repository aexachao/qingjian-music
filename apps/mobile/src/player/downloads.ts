import { Directory, File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import type { Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import {
  assertNamespacesDisjoint,
  downloadFileName,
  downloadKey,
  downloadTranscodeFileName,
} from '@/lib/download-policy'
import { parseHlsPlaylist } from './hls-playlist'
import { validatePlaylistAgainstSource, validateTranscodeProduct } from './audio-cache-policy'
import { countBoxes } from './mp4-boxes'
import { fetchTranscodeBytes, fetchTranscodeText } from './download-transcode-fetch'
import type {
  DownloadAttempt,
  DownloadEntry,
  DownloadIndex,
  DownloadJobState,
  DownloadJournalRecord,
  Listener,
} from './download-types'

// 下载相关的类型集中在 download-types.ts，这里转出给管理页等外部消费者（import 路径不变）。
export type { DownloadEntry, DownloadJobState } from './download-types'
/**
 * 原生模块**动态**载入。
 *
 * 不能静态 import：那个入口会拉进 `expo`，而 `expo` 的入口在 node 环境（单测）里
 * 需要原生文件（`./ImportMetaRegistry`）会直接抛 —— 于是**任何** import 到播放核心的
 * 测试都跑不起来。动态 import 之后，测试环境的模块图里没有 `expo`，
 * 而 App 里调用时才真正加载（Metro 支持动态 import）。
 */
type AudioDownloaderModule = typeof import('../../modules/audio-downloader')

async function loadNativeModule(): Promise<AudioDownloaderModule | null> {
  try {
    return await import('../../modules/audio-downloader')
  } catch {
    return null
  }
}

let nativeModulePromise: Promise<AudioDownloaderModule | null> | null = null

function nativeModule(): Promise<AudioDownloaderModule | null> {
  if (!nativeModulePromise) nativeModulePromise = loadNativeModule()
  return nativeModulePromise
}

/**
 * 下载（用户显式要求的离线文件）。
 *
 * ── 与播放缓存的区别（必须记住）────────────────────────────────────────────
 * `player/audio-cache.ts` 是**播放时的自动缓存**：会被配额淘汰、设置里能一键清空。
 * 这里是**用户显式下载**：目录在 `Document/downloads/`（不在 `Cache/`，系统清理不会动它）、
 * 登记表独立（`index.json`）、**不参与缓存淘汰**、只有用户能删。
 * `assertNamespacesDisjoint` 在模块加载时就断言两者不是同一个目录。
 *
 * ── 两条下载路径 ────────────────────────────────────────────────────────────
 * 1. **直连原文件**（绝大多数曲目）：一个 HTTP GET → 交给 iOS 后台会话，App 挂起/被杀都继续。
 *    Android 用系统 DownloadManager（同样真后台）；原生模块不在时回退到前台下载。
 * 2. **需要转码的曲目**（设备原生解不了的格式，如 TTA/DSD/APE）：产物是 HLS 分片，
 *    走 `downloadTranscodeTrack`：起转码会话 + 心跳保活 → 取 init + 分片 → 按序拼成 fMP4。
 *    ⭐ **关键约束**：转码会话要 10 秒心跳，而心跳只能在 JS 里发。App 一被挂起，
 *    JS 就冻住 → 无心跳 → 约 1 分钟后分片 410。所以转码下载走 **JS 前台/后台播音态**：
 *    App 在前台、或在后台但正在播音（`UIBackgroundModes: audio`）时能下；彻底挂起则暂停，
 *    回到 App 可重试。原生后台会话对转码帮不上忙（它照样不能发心跳），所以不用它。
 */

const DOWNLOAD_DIR = 'downloads'
const MAX_ACTIVE_DOWNLOADS = 2
/** 播放缓存的目录名（`player/audio-cache.ts`）。这里复制一份只为了断言两者不同 —— 见下方。 */
const CACHE_DIR = 'audio'

let index: DownloadIndex | null = null
const jobs = new Map<string, DownloadJobState>()
const listeners = new Set<Listener>()
let unsubscribeNative: (() => void) | null = null
let nativeSubscriptionPromise: Promise<void> | null = null
/** 持久化的下载 journal：JS 被杀后仍能用元数据补登记。 */
let journal: Record<string, DownloadEntry> | null = null
/** 结算后要回写登记表的「等成品文件出现」的作业：key → 元数据 */
const pendingSettlements = new Map<string, DownloadEntry>()
const attemptsByKey = new Map<string, DownloadAttempt>()
const attemptsById = new Map<string, DownloadAttempt>()
const queuedAttempts: DownloadAttempt[] = []
/** Native work recovered from the durable journal still occupies a download slot. */
const recoveredNativeById = new Map<string, string>()
const recoveredNativeByKey = new Map<string, string>()
let activeDownloadCount = 0
let nextAttemptNumber = 0
let queueSuspended = false
let reconciliationComplete = false
let reconciliationBlocked = false
let reconciliationPromise: Promise<void> | null = null
const cancelledAttemptFiles = new Map<string, string>()

class DownloadRegistrationError extends Error {}

assertNamespacesDisjoint(CACHE_DIR, DOWNLOAD_DIR)

function downloadsDir(): Directory {
  const dir = new Directory(Paths.document, DOWNLOAD_DIR)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

function indexFile(): File {
  return new File(downloadsDir(), 'index.json')
}

function journalFile(): File {
  return new File(downloadsDir(), 'pending-journal.json')
}

function journalRecordFile(key: string, attemptId: string): File {
  return new File(downloadsDir(), `record-${safeFilePart(key)}-${safeFilePart(attemptId)}.json`)
}

function safeFilePart(value: string): string {
  return value.replace(/[^\w-]/g, '_')
}

function writeJournalRecord(record: DownloadJournalRecord): boolean {
  try {
    const file = journalRecordFile(record.key, record.attemptId)
    if (!file.exists) file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify(record))
    loadJournal()[record.key] = record.entry
    return persistJournal()
  } catch {
    return false
  }
}

function readJournalRecords(): DownloadJournalRecord[] {
  try {
    return downloadsDir().list().flatMap((item) => {
      if (!(item instanceof File) || !item.name.startsWith('record-') || !item.name.endsWith('.json')) return []
      try {
        const parsed = JSON.parse(item.textSync()) as DownloadJournalRecord
        return parsed?.version === 1 && typeof parsed.key === 'string' &&
          typeof parsed.attemptId === 'string' && parsed.entry?.key === parsed.key &&
          ['pending', 'completed'].includes(parsed.state)
          ? [parsed]
          : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

function removeJournalRecords(key: string): void {
  try {
    for (const item of downloadsDir().list()) {
      if (item instanceof File && item.name.startsWith(`record-${safeFilePart(key)}-`)) {
        try { item.delete() } catch { /* best effort */ }
      }
    }
  } catch {
    // The stable journal remains as a recovery source if directory enumeration fails.
  }
}

function removeJournalRecordAttempt(attemptId: string): void {
  for (const record of readJournalRecords()) {
    if (record.attemptId !== attemptId) continue
    try { journalRecordFile(record.key, record.attemptId).delete() } catch { /* best effort */ }
  }
}

function loadJournal(): Record<string, DownloadEntry> {
  if (journal) return journal
  try {
    const file = journalFile()
    if (file.exists) {
      const parsed = JSON.parse(file.textSync()) as { version?: number; entries?: Record<string, DownloadEntry> }
      if (parsed?.version === 1 && parsed.entries) {
        journal = parsed.entries
        return journal
      }
    }
  } catch {
    // journal 损坏时保留成品文件，reconcile 会重新扫描并恢复。
  }
  journal = {}
  return journal
}

function persistJournal(): boolean {
  try {
    const file = journalFile()
    if (!file.exists) file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify({ version: 1, entries: loadJournal() }))
    return true
  } catch {
    return false
  }
}

function journalDelete(key: string): void {
  const current = loadJournal()
  if (!(key in current)) return
  delete current[key]
  persistJournal()
}

function loadIndex(): DownloadIndex {
  if (index) return index
  try {
    const file = indexFile()
    if (file.exists) {
      const parsed = JSON.parse(file.textSync()) as DownloadIndex
      if (parsed?.version === 1 && parsed.entries) {
        index = parsed
        return index
      }
    }
  } catch {
    // 索引坏了就重建：文件还在，下次对账能补回来
  }
  index = { version: 1, entries: {} }
  for (const record of readJournalRecords()) {
    if (record.state !== 'completed') continue
    try {
      const size = validatedFileSize(record.entry)
      if (size > 0) index.entries[record.key] = { ...record.entry, bytes: size }
    } catch {
      // Ignore one unreadable sidecar; other completed records can still recover.
    }
  }
  return index
}

function persistIndex(): boolean {
  const current = loadIndex()
  try {
    const file = indexFile()
    if (!file.exists) file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify(current))
    return true
  } catch {
    // 写失败只影响登记表精度，下次对账会用磁盘补
    return false
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

/** 订阅下载状态变化（管理页与菜单用它刷新） */
export function subscribeDownloads(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 已下载列表（按下载时间倒序） */
export function listDownloads(): DownloadEntry[] {
  return Object.values(loadIndex().entries).sort((a, b) => b.downloadedAt - a.downloadedAt)
}

export function downloadStats(): { count: number; bytes: number } {
  const entries = listDownloads()
  return { count: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) }
}

export function downloadJobStates(): DownloadJobState[] {
  return [...jobs.values()]
}

function entryFor(serverId: string, trackId: string): DownloadEntry | undefined {
  return loadIndex().entries[downloadKey(serverId, trackId)]
}

/** 这首歌是否已下载 */
export function isDownloaded(serverId: string, trackId: string): boolean {
  const entry = entryFor(serverId, trackId)
  if (!entry) return false
  if (validatedFileSize(entry) > 0) return true
  delete loadIndex().entries[entry.key]
  persistIndex()
  emit()
  return false
}

/**
 * 已下载文件的本地地址（播放时**先查这个**，命中就不走网络）。
 * 文件被用户在系统里删掉时顺手清掉登记项，避免「显示已下载但放不了」。
 */
export function downloadedUri(serverId: string, trackId: string): string | undefined {
  const entry = entryFor(serverId, trackId)
  if (!entry) return undefined
  try {
    const file = new File(downloadsDir(), entry.fileName)
    if (validatedFileSize(entry) > 0) return file.uri
  } catch {
    return undefined
  }
  delete loadIndex().entries[entry.key]
  persistIndex()
  emit()
  return undefined
}

/**
 * 已下载文件的播放 content-type。
 * 转码产物磁盘上是 fMP4，登记表里记了 `contentType: audio/mp4` —— 播放必须用它，
 * 否则按原始格式（如 `dsf`）查 contentType 会得到 undefined，RNTP 会拒播。
 * 普通直连文件没记 contentType，返回 undefined，交给调用方按 format 兜底。
 */
export function downloadedContentType(serverId: string, trackId: string): string | undefined {
  return entryFor(serverId, trackId)?.contentType
}

/** 下载一首（直连原文件走后台会话；需转码的曲目走 HLS 拼接，见 `downloadTranscodeTrack`） */
export function downloadTrack(options: {
  provider: MusicProvider
  serverId: string
  track: Track
  /** 需要转码的曲目（设备原生解不了）走 HLS 拼接路径 */
  requiresTranscode: boolean
}): Promise<void> {
  const { serverId, track } = options
  const key = downloadKey(serverId, track.id)
  if (isDownloaded(serverId, track.id)) return Promise.resolve()
  // A transient lookup failure blocks pumping, but a fresh request retries the
  // reconciliation before it can start provider or native work.
  reconciliationBlocked = false
  const existing = attemptsByKey.get(key)
  if (existing) return existing.promise
  if (recoveredNativeByKey.has(key)) return Promise.resolve()
  // A previous startup reconciliation may have failed transiently. A fresh user
  // request gets one clean retry instead of leaving queued work permanently blocked.
  reconciliationBlocked = false

  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((accept, failPromise) => {
    resolve = accept
    reject = failPromise
  })
  const id = `download-${Date.now()}-${++nextAttemptNumber}`
  const attempt: DownloadAttempt = {
    key,
    id,
    controller: new AbortController(),
    promise,
    cancelled: false,
    nativeStarted: false,
    nativeStartPending: false,
    active: false,
    finished: false,
    resolve,
    reject,
  }
  attemptsByKey.set(key, attempt)
  attemptsById.set(id, attempt)
  attemptOptions.set(id, options)
  jobs.set(key, { key, state: 'downloading', completed: 0, total: 1 })
  queuedAttempts.push(attempt)
  emit()
  pumpDownloadQueue()
  return promise
}

function pumpDownloadQueue(): void {
  if (queueSuspended) return
  if (reconciliationBlocked) return
  if (!reconciliationComplete) {
    void reconcileDownloads().then(pumpDownloadQueue).catch((error: unknown) => {
      reconciliationBlocked = true
      const reason = error instanceof Error ? error.message : '无法恢复下载记录'
      for (const attempt of queuedAttempts.splice(0)) {
        jobs.set(attempt.key, { key: attempt.key, state: 'failed', completed: 0, total: 1, error: reason })
        finishAttempt(attempt, error)
      }
      emit()
    })
    return
  }
  while (activeDownloadCount < MAX_ACTIVE_DOWNLOADS && queuedAttempts.length > 0) {
    const attempt = queuedAttempts.shift()!
    if (attempt.cancelled || attemptsByKey.get(attempt.key) !== attempt) {
      finishAttempt(attempt, new Error('下载已取消'))
      continue
    }
    attempt.active = true
    activeDownloadCount += 1
    void startDownloadAttempt(attempt)
      .then((nativeStarted) => {
        if (attempt.finished) return
        attempt.nativeStarted = nativeStarted
        attempt.resolve()
        if (!nativeStarted) finishAttempt(attempt)
      })
      .catch((error: unknown) => {
        if (!attempt.finished) {
          void nativeModule().then((native) => native?.cancelAudioDownloadJob(attempt.id)).catch(() => undefined)
          if (error instanceof DownloadRegistrationError) {
            jobs.set(attempt.key, { key: attempt.key, state: 'failed', completed: 1, total: 1, error: error.message })
            emit()
          } else {
            failAttempt(attempt, error instanceof Error ? error.message : '下载失败')
          }
          finishAttempt(attempt, error)
        }
      })
  }
}

function finishAttempt(attempt: DownloadAttempt, error?: unknown): void {
  if (attempt.finished) return
  attempt.finished = true
  attemptsById.delete(attempt.id)
  attemptOptions.delete(attempt.id)
  if (attemptsByKey.get(attempt.key) === attempt) attemptsByKey.delete(attempt.key)
  if (attempt.active) {
    attempt.active = false
    activeDownloadCount = Math.max(0, activeDownloadCount - 1)
  }
  if (error !== undefined) attempt.reject(error)
  else attempt.resolve()
  pumpDownloadQueue()
}

function registerRecoveredNativeJob(id: string, key: string): void {
  const previousKey = recoveredNativeById.get(id)
  if (previousKey && previousKey !== key) recoveredNativeByKey.delete(previousKey)
  const previousId = recoveredNativeByKey.get(key)
  if (previousId && previousId !== id) releaseRecoveredNativeJob(previousId)
  if (recoveredNativeById.has(id)) return
  recoveredNativeById.set(id, key)
  recoveredNativeByKey.set(key, id)
  activeDownloadCount += 1
}

function releaseRecoveredNativeJob(id: string): void {
  const key = recoveredNativeById.get(id)
  if (!key) return
  recoveredNativeById.delete(id)
  if (recoveredNativeByKey.get(key) === id) recoveredNativeByKey.delete(key)
  activeDownloadCount = Math.max(0, activeDownloadCount - 1)
  pumpDownloadQueue()
}

function failAttempt(attempt: DownloadAttempt, reason: string): void {
  if (attempt.cancelled || attemptsByKey.get(attempt.key) !== attempt) return
  fail(attempt.key, reason, attempt.id)
}

async function startDownloadAttempt(attempt: DownloadAttempt): Promise<boolean> {
  const { key } = attempt
  const options = attemptOptions.get(attempt.id)
  if (!options) throw new Error('下载任务不存在')
  const { provider, serverId, track, requiresTranscode } = options

  if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')

  if (requiresTranscode) {
    await downloadTranscodeTrack({ provider, serverId, track, attempt })
    return false
  }

  const fileName = attemptFileName(downloadFileName(serverId, track.id, track.audio?.format), attempt.id)
  const entry = makeDownloadEntry(key, serverId, track, fileName)
  const record: DownloadJournalRecord = { version: 1, key, attemptId: attempt.id, state: 'pending', entry }
  if (!writeJournalRecord(record)) throw new Error('无法保存下载记录，未启动下载')
  pendingSettlements.set(key, entry)
  emit()

  const stream = await provider.stream(track.id, { quality: 'original', allowTranscode: false })
  if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')
  await ensureNativeSubscription()
  if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')

  const destination = new File(downloadsDir(), fileName)
  const partsDirectory = new Directory(downloadsDir(), `parts-${safeFilePart(attempt.id)}`)
  if (!partsDirectory.exists) partsDirectory.create({ intermediates: true })
  const native = await nativeModule()
  if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')

  attempt.nativeStartPending = true
  const started = await (native?.startAudioDownloadJob({
    id: attempt.id,
    urls: [stream.url],
    headers: stream.headers ?? {},
    destination: destination.uri.replace('file://', ''),
    partsDirectory: partsDirectory.uri.replace('file://', ''),
  }) ?? false)
  attempt.nativeStartPending = false
  if (!isCurrentAttempt(attempt)) {
    if (started) await native?.cancelAudioDownloadJob(attempt.id).catch(() => undefined)
    throw new Error('下载已取消')
  }
  if (started) {
    attempt.nativeStarted = true
    return true
  }

  const partial = new File(downloadsDir(), `${fileName}.${attempt.id}.part`)
  try {
    const file = await File.downloadFileAsync(stream.url, partial, {
      headers: stream.headers,
      idempotent: true,
      signal: attempt.controller.signal,
    })
    if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')
    const bytes = file.size ?? 0
    if (bytes <= 0) throw new Error('下载文件为空')
    if (destination.exists) destination.delete()
    await file.move(destination)
    if (!writeCompleteMarker(entry, bytes) || !settle(key, bytes, attempt.id)) {
      throw new DownloadRegistrationError('下载完成，但无法验证或登记文件；下次启动会重试')
    }
    return false
  } catch (error) {
    try { if (partial.exists) partial.delete() } catch { /* best effort */ }
    throw error
  }
}

const attemptOptions = new Map<string, {
  provider: MusicProvider
  serverId: string
  track: Track
  requiresTranscode: boolean
}>()

function isCurrentAttempt(attempt: DownloadAttempt): boolean {
  return !attempt.cancelled && !attempt.controller.signal.aborted && attemptsByKey.get(attempt.key) === attempt
}

function makeDownloadEntry(key: string, serverId: string, track: Track, fileName: string): DownloadEntry {
  return {
    key,
    serverId,
    trackId: track.id,
    title: track.title,
    artistText: track.artists.map((artist) => artist.name).join(' / ') || '未知艺术家',
    ...(track.coverId ?? track.album?.coverId
      ? { coverId: (track.coverId ?? track.album?.coverId) as string }
      : {}),
    fileName,
    bytes: 0,
    downloadedAt: Date.now(),
    track,
    ...(track.audio?.format ? { format: track.audio.format } : {}),
  }
}

function writeCompleteMarker(entry: DownloadEntry, bytes: number): boolean {
  if (Platform.OS !== 'android') return true
  try {
    const marker = new File(downloadsDir(), `${entry.fileName}.complete`)
    if (!marker.exists) marker.create({ intermediates: true, overwrite: true })
    marker.write(String(bytes))
    return marker.textSync() === String(bytes)
  } catch {
    return false
  }
}

function validatedFileSize(entry: DownloadEntry): number {
  try {
    const file = new File(downloadsDir(), entry.fileName)
    const size = file.exists ? file.size ?? 0 : 0
    if (size <= 0) return 0
    if (Platform.OS === 'android') {
      const marker = new File(downloadsDir(), `${entry.fileName}.complete`)
      if (!marker.exists || marker.textSync() !== String(size)) return 0
    }
    return size
  } catch {
    return 0
  }
}

function attemptFileName(fileName: string, attemptId: string): string {
  const extensionIndex = fileName.lastIndexOf('.')
  if (extensionIndex <= 0) return `${fileName}-${safeFilePart(attemptId)}`
  return `${fileName.slice(0, extensionIndex)}-${safeFilePart(attemptId)}${fileName.slice(extensionIndex)}`
}


/**
 * 下载「需要转码」的曲目（设备原生解不了的格式：TTA/DSD/APE 等）。
 *
 * ── 为什么和直连不是一条路 ──────────────────────────────────────────────────
 * 飞牛的转码产物不是一个静态文件，而是一条 **HLS 播放列表**（init.mp4 + N 个分片），
 * 且转码任务靠 **10 秒心跳保活**（断约 1 分钟分片就 410）。心跳只能在 JS 里发 ——
 * App 一被系统挂起 JS 就冻结，所以这条路**只能在 App 进程活着时跑**
 * （前台，或后台正在播音频）。产物按序字节拼接就是合法 fMP4，能当本地文件直接播。
 *
 * ── 流程 ────────────────────────────────────────────────────────────────────
 * 1. 起转码会话（`provider.stream(allowTranscode:true)`）→ 拿 m3u8 地址 + session。
 * 2. 开心跳定时器保活（下载全程不断）。
 * 3. 取播放列表并解析 → 预校验时长 → 逐个取 init + 分片，边取边追加写入 `.part`。
 * 4. 校验 moof/mdat 配平 → 改名成成品 → 登记（`contentType: audio/mp4`）。
 * 5. 无论成败都关掉会话（别在服务端堆转码进程）。
 */
async function downloadTranscodeTrack(options: {
  provider: MusicProvider
  serverId: string
  track: Track
  attempt: DownloadAttempt
}): Promise<void> {
  const { provider, serverId, track, attempt } = options
  const key = downloadKey(serverId, track.id)
  const fileName = attemptFileName(downloadTranscodeFileName(serverId, track.id), attempt.id)
  const entry: DownloadEntry = { ...makeDownloadEntry(key, serverId, track, fileName), contentType: 'audio/mp4' }
  if (!writeJournalRecord({ version: 1, key, attemptId: attempt.id, state: 'pending', entry })) {
    throw new Error('无法保存下载记录，未启动转码下载')
  }
  pendingSettlements.set(key, entry)
  emit()

  let stream: Awaited<ReturnType<MusicProvider['stream']>>
  try {
    stream = await provider.stream(track.id, { quality: 'original', allowTranscode: true })
    if (!isCurrentAttempt(attempt)) {
      await stream.session?.close().catch(() => undefined)
      throw new Error('下载已取消')
    }
  } catch (error) {
    failAttempt(attempt, error instanceof Error ? error.message : '转码会话初始化失败')
    throw error
  }
  if (stream.transport !== 'hls' || !stream.session) {
    // 说不上是转码：把会话收掉，退回失败（理论上不该走到这，防御性处理）
    await stream.session?.close().catch(() => undefined)
    failAttempt(attempt, '服务端没有返回转码会话')
    throw new Error('这首歌无法转码下载')
  }

  const session = stream.session
  const headers = stream.headers ?? {}
  const sourceDurationSeconds = track.durationMs / 1000

  // 心跳保活：转码期间必须持续发（timestamp 是播放位置秒、必须严格递增，
  // 没有真实播放位置就拿「已耗时」当递增序列，对齐 spike 的做法）
  const startedAt = Date.now()
  let lastSeconds = -1
  let heartbeatFailed = false
  let heartbeatInFlight = false
  let closeStarted = false
  const closeSession = (): void => {
    if (closeStarted) return
    closeStarted = true
    void session.close().catch(() => undefined)
  }
  const heartbeatTimer = setInterval(() => {
    if (!isCurrentAttempt(attempt) || heartbeatInFlight) return
    heartbeatInFlight = true
    const seconds = (Date.now() - startedAt) / 1000
    const timestamp = seconds > lastSeconds ? seconds : lastSeconds + 0.001
    lastSeconds = timestamp
    void session.heartbeat(timestamp * 1000)
      .catch(() => { heartbeatFailed = true })
      .finally(() => { heartbeatInFlight = false })
  }, session.heartbeatIntervalMs)
  const abortHeartbeat = (): void => {
    clearInterval(heartbeatTimer)
    closeSession()
  }
  attempt.controller.signal.addEventListener('abort', abortHeartbeat, { once: true })

  const destination = new File(downloadsDir(), fileName)
  const part = new File(downloadsDir(), `${fileName}.part`)

  try {
    const playlistText = await fetchTranscodeText(stream.url, headers, attempt.controller.signal)
    if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')
    const playlist = parseHlsPlaylist(playlistText, stream.url)
    if (!playlist.isComplete) {
      throw new Error('转码播放列表不完整（无 ENDLIST），放弃下载')
    }
    const precheck = validatePlaylistAgainstSource(playlist.durationSeconds, sourceDurationSeconds)
    if (!precheck.ok) {
      throw new Error(`转码下载预校验失败：${precheck.reason}`)
    }

    if (part.exists) part.delete()
    part.create({ intermediates: true, overwrite: true })

    let moofCount = 0
    let mdatCount = 0
    let nonEmptySegments = 0
    let writtenBytes = 0
    const totalUnits = playlist.segmentUris.length + (playlist.initUri ? 1 : 0)
    let done = 0

    const bump = (): void => {
      done += 1
      jobs.set(key, { key, state: 'downloading', completed: done, total: totalUnits })
      emit()
    }

    if (playlist.initUri) {
      const init = await fetchTranscodeBytes(playlist.initUri, headers, 'init', attempt.controller.signal)
      if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')
      part.write(init, { append: true })
      writtenBytes += init.byteLength
      bump()
    }

    for (const [index, uri] of playlist.segmentUris.entries()) {
      const bytes = await fetchTranscodeBytes(
        uri,
        headers,
        `分片 ${index + 1}/${playlist.segmentUris.length}`,
        attempt.controller.signal,
      )
      if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')
      part.write(bytes, { append: true })
      writtenBytes += bytes.byteLength
      const moof = countBoxes(bytes, 'moof')
      moofCount += moof
      mdatCount += countBoxes(bytes, 'mdat')
      if (moof > 0) nonEmptySegments += 1
      bump()
    }

    const validation = validateTranscodeProduct({
      moofCount,
      mdatCount,
      nonEmptySegmentCount: nonEmptySegments,
      sourceDurationSeconds,
    })
    if (!validation.ok) {
      throw new Error(`转码产物校验失败：${validation.reason}`)
    }

    if (!isCurrentAttempt(attempt)) throw new Error('下载已取消')
    if (destination.exists) destination.delete()
    await part.move(destination)
    const finalBytes = destination.size ?? writtenBytes
    if (!writeCompleteMarker(entry, finalBytes) || !settle(key, finalBytes, attempt.id)) {
      throw new DownloadRegistrationError('转码已完成，但无法验证或登记文件；下次启动会重试')
    }
  } catch (error) {
    try {
      if (part.exists) part.delete()
    } catch {
      // 忽略半成品清理失败
    }
    const reason = heartbeatFailed
      ? '转码会话已失效（可能切到后台过久），请回到 App 重试'
      : error instanceof Error
        ? error.message
        : '转码下载失败'
    if (error instanceof DownloadRegistrationError) {
      jobs.set(key, { key, state: 'failed', completed: 1, total: 1, error: reason })
      emit()
    } else {
      failAttempt(attempt, reason)
    }
    if (error instanceof DownloadRegistrationError) throw error
    throw new Error(reason)
  } finally {
    clearInterval(heartbeatTimer)
    attempt.controller.signal.removeEventListener('abort', abortHeartbeat)
    closeSession()
  }
}

/** 删除单条下载（连带删文件；删不掉也把登记项清掉，避免显示假状态） */
export function removeDownload(key: string): void {
  const journalRecords = readJournalRecords().filter((record) => record.key === key)
  const attempt = attemptsByKey.get(key)
  if (attempt) {
    const attemptEntry = journalRecords.find((record) => record.attemptId === attempt.id)?.entry
    if (attemptEntry) {
      cancelledAttemptFiles.set(attempt.id, attemptEntry.fileName)
      while (cancelledAttemptFiles.size > 64) {
        const oldest = cancelledAttemptFiles.keys().next().value
        if (oldest === undefined) break
        cancelledAttemptFiles.delete(oldest)
      }
    }
    attempt.cancelled = true
    attempt.controller.abort(new Error('下载已取消'))
    const queueIndex = queuedAttempts.indexOf(attempt)
    if (queueIndex >= 0) queuedAttempts.splice(queueIndex, 1)
    if (attempt.nativeStarted) {
      void nativeModule()
        .then((native) => native?.cancelAudioDownloadJob(attempt.id))
        .catch(() => undefined)
        .finally(() => finishAttempt(attempt, new Error('下载已取消')))
    } else if (!attempt.nativeStartPending) {
      finishAttempt(attempt, new Error('下载已取消'))
    } else {
      attempt.reject(new Error('下载已取消'))
    }
  }
  for (const record of journalRecords) {
    if (record.attemptId === attempt?.id) continue
    void nativeModule().then((native) => native?.cancelAudioDownloadJob(record.attemptId)).catch(() => undefined)
  }
  const recoveredId = recoveredNativeByKey.get(key)
  if (recoveredId) {
    void nativeModule().then((native) => native?.cancelAudioDownloadJob(recoveredId)).catch(() => undefined)
    releaseRecoveredNativeJob(recoveredId)
  }
  const current = loadIndex()
  const entry = current.entries[key] ?? journalRecords.find((record) => record.state === 'completed')?.entry ?? journalRecords[0]?.entry
  if (entry) {
    const filesToRemove = new Set([
      entry.fileName,
      `${entry.fileName}.complete`,
      ...journalRecords.flatMap((record) => [
        record.entry.fileName,
        `${record.entry.fileName}.complete`,
        `${record.entry.fileName}.partial`,
      ]),
    ])
    try {
      for (const fileName of filesToRemove) {
        const file = new File(downloadsDir(), fileName)
        if (file.exists) {
          file.delete()
          if (file.exists) throw new Error('file still exists')
        }
      }
      for (const record of journalRecords) {
        for (const suffix of [`${record.entry.fileName}.${record.attemptId}.part`, `${record.entry.fileName}.part`]) {
          const partial = new File(downloadsDir(), suffix)
          if (partial.exists) {
            partial.delete()
            if (partial.exists) throw new Error('partial file still exists')
          }
        }
      }
    } catch {
      jobs.set(key, { key, state: 'failed', completed: 0, total: 1, error: '无法删除下载文件，下载登记已保留' })
      emit()
      throw new Error('无法删除下载文件，下载登记已保留')
    }
  }
  if (entry) {
    delete current.entries[key]
    if (!persistIndex()) {
      current.entries[key] = entry
      jobs.set(key, { key, state: 'failed', completed: 0, total: 1, error: '下载文件已删除，但无法更新本地索引' })
      emit()
      throw new Error('下载文件已删除，但无法更新本地索引')
    }
  }
  pendingSettlements.delete(key)
  journalDelete(key)
  removeJournalRecords(key)
  jobs.delete(key)
  emit()
}

/** 全部删除 */
export function clearDownloads(): void {
  queueSuspended = true
  try {
    for (const key of new Set([
      ...attemptsByKey.keys(),
      ...Object.keys(loadJournal()),
      ...readJournalRecords().map((record) => record.key),
    ])) removeDownload(key)
    for (const entry of listDownloads()) removeDownload(entry.key)
  } finally {
    queueSuspended = false
    pumpDownloadQueue()
  }
  // 分片目录也一并清掉（半成品不该留在磁盘上）
  try {
    const dir = downloadsDir()
    for (const item of dir.list()) {
      if (!(item instanceof Directory)) continue
      if (!item.name.startsWith('parts-')) continue
      try {
        item.delete()
      } catch {
        // 忽略
      }
    }
    for (const item of dir.list()) {
      if (item instanceof File && item.name.endsWith('.part')) {
        try { item.delete() } catch { /* best effort */ }
      }
    }
  } catch {
    // 忽略
  }
  emit()
}

// ---- 完成 / 失败 的内部结算 ----

function settle(key: string, bytes: number, attemptId?: string): boolean {
  const matchingRecord = attemptId
    ? readJournalRecords().find((record) => record.key === key && record.attemptId === attemptId)
    : undefined
  const activeAttempt = attemptId ? attemptsById.get(attemptId) : undefined
  const newerAttempt = attemptsByKey.get(key)
  const legacyEntry = attemptId === key ? loadJournal()[key] : undefined
  if (attemptId && !matchingRecord && !activeAttempt && !legacyEntry) return false
  if (attemptId && newerAttempt && newerAttempt.id !== attemptId) return false
  if (activeAttempt && !isCurrentAttempt(activeAttempt)) return false
  const pending = matchingRecord?.entry ?? legacyEntry ?? pendingSettlements.get(key) ?? loadJournal()[key]
  if (!pending) return false
  const verifiedBytes = validatedFileSize(pending)
  if (verifiedBytes <= 0) {
    fail(key, '下载成品缺失或长度校验失败', attemptId)
    return false
  }
  if (bytes > 0 && verifiedBytes !== bytes) {
    jobs.set(key, { key, state: 'failed', completed: 1, total: 1, error: '下载成品长度与原生报告不一致；下次启动会重试' })
    emit()
    return false
  }
  const completedEntry = { ...pending, bytes: verifiedBytes, downloadedAt: Date.now() }
  if (matchingRecord && !writeJournalRecord({ ...matchingRecord, state: 'completed', entry: completedEntry })) {
    jobs.set(key, { key, state: 'failed', completed: 1, total: 1, error: '下载完成，但无法保存恢复记录；下次启动会重试登记' })
    emit()
    return false
  }
  const current = loadIndex()
  const previous = current.entries[key]
  current.entries[key] = completedEntry
  if (!persistIndex()) {
    if (previous) current.entries[key] = previous
    else delete current.entries[key]
    jobs.set(key, { key, state: 'failed', completed: 1, total: 1, error: '下载完成，但无法登记到本地索引' })
    emit()
    return false
  }
  pendingSettlements.delete(key)
  journalDelete(key)
  jobs.delete(key)
  // 分片目录用完就清掉：成品已经拼好了，留着只会占空间（且用户看到的是「下载目录里多了一堆东西」）
  cleanupPartsDirectory(attemptId ?? key)
  emit()
  return true
}

function cleanupPartsDirectory(key: string): void {
  try {
    const dir = new Directory(downloadsDir(), `parts-${key.replace(/[^\w-]/g, '_')}`)
    if (dir.exists) dir.delete()
  } catch {
    // 清不掉不影响功能
  }
}

function fail(key: string, reason: string, attemptId?: string): void {
  if (attemptId) {
    const attempt = attemptsById.get(attemptId)
    const record = readJournalRecords().find((item) => item.key === key && item.attemptId === attemptId)
    const legacyEntry = attemptId === key ? loadJournal()[key] : undefined
    if (attempt && !isCurrentAttempt(attempt)) return
    if (!attempt && !record && !legacyEntry) return
  }
  pendingSettlements.delete(key)
  journalDelete(key)
  if (attemptId) removeJournalRecordAttempt(attemptId)
  const previous = jobs.get(key)
  jobs.set(key, {
    key,
    state: 'failed',
    completed: previous?.completed ?? 0,
    total: previous?.total ?? 0,
    error: reason,
  })
  emit()
}

async function ensureNativeSubscription(): Promise<void> {
  if (unsubscribeNative) return
  if (nativeSubscriptionPromise) return nativeSubscriptionPromise
  nativeSubscriptionPromise = subscribeNativeEvents().finally(() => {
    nativeSubscriptionPromise = null
  })
  return nativeSubscriptionPromise
}

async function subscribeNativeEvents(): Promise<void> {
  const native = await nativeModule()
  if (unsubscribeNative || !native?.hasNativeDownloader()) return
  const subscription = native.subscribeAudioDownload({
    onProgress: ({ id, completed, total }) => {
      const attempt = attemptsById.get(id)
      const record = readJournalRecords().find((item) => item.attemptId === id && item.state === 'pending')
      const key = attempt?.key ?? record?.key ?? (loadJournal()[id] ? id : undefined)
      if (!key || (attempt && !isCurrentAttempt(attempt)) || (attemptsByKey.has(key) && attemptsByKey.get(key)?.id !== id)) return
      jobs.set(key, { key, state: 'downloading', completed, total })
      emit()
    },
    onFinished: ({ id, bytes }) => {
      const attempt = attemptsById.get(id)
      const record = readJournalRecords().find((item) => item.attemptId === id && item.state === 'pending')
      const key = attempt?.key ?? record?.key ?? (loadJournal()[id] ? id : undefined)
      if (!key) {
        const cancelledFileName = cancelledAttemptFiles.get(id)
        if (cancelledFileName) {
          try { new File(downloadsDir(), cancelledFileName).delete() } catch { /* best effort */ }
          cancelledAttemptFiles.delete(id)
        }
        return
      }
      if (attemptsByKey.has(key) && attemptsByKey.get(key)?.id !== id) {
        const staleRecord = readJournalRecords().find((item) => item.attemptId === id)
        if (staleRecord) {
          try { new File(downloadsDir(), staleRecord.entry.fileName).delete() } catch { /* best effort */ }
          removeJournalRecordAttempt(id)
        }
        return
      }
      settle(key, bytes, id)
      releaseRecoveredNativeJob(id)
      if (attempt) finishAttempt(attempt)
    },
    onFailed: ({ id, reason }) => {
      const attempt = attemptsById.get(id)
      const record = readJournalRecords().find((item) => item.attemptId === id && item.state === 'pending')
      const key = attempt?.key ?? record?.key ?? (loadJournal()[id] ? id : undefined)
      if (!key) {
        const cancelledFileName = cancelledAttemptFiles.get(id)
        if (cancelledFileName) {
          try { new File(downloadsDir(), cancelledFileName).delete() } catch { /* best effort */ }
          cancelledAttemptFiles.delete(id)
        }
        return
      }
      const newerAttempt = attemptsByKey.get(key)
      if (newerAttempt && newerAttempt.id !== id) {
        const staleEntry = record?.entry ?? loadJournal()[key]
        if (staleEntry) {
          try { new File(downloadsDir(), staleEntry.fileName).delete() } catch { /* best effort */ }
        }
        if (record) removeJournalRecordAttempt(id)
        return
      }
      fail(key, reason, id)
      releaseRecoveredNativeJob(id)
      if (attempt) finishAttempt(attempt, new Error(reason))
    },
  })
  if (unsubscribeNative) subscription()
  else unsubscribeNative = subscription
}

/**
 * 启动对账。
 *
 * App 被杀死期间，系统可能已经把分片下完（甚至已经拼好），而 JS 当时不在场 ——
 * 这里把它们补登记进 `index.json`，否则会出现「文件在磁盘上、App 里却显示未下载」。
 */
export function reconcileDownloads(): Promise<void> {
  if (reconciliationComplete) return Promise.resolve()
  if (reconciliationPromise) return reconciliationPromise
  reconciliationBlocked = false
  reconciliationPromise = reconcileDownloadsInternal().then((nativeLookupSucceeded) => {
    if (!nativeLookupSucceeded) {
      reconciliationBlocked = true
      throw new Error('无法查询原生下载状态，请重试')
    }
    reconciliationComplete = true
    pumpDownloadQueue()
  }).finally(() => {
    reconciliationPromise = null
  })
  return reconciliationPromise
}

async function reconcileDownloadsInternal(): Promise<boolean> {
  await ensureNativeSubscription()
  activeDownloadCount = Math.max(0, activeDownloadCount - recoveredNativeById.size)
  recoveredNativeById.clear()
  recoveredNativeByKey.clear()
  const records = readJournalRecords()
  const nativeJobs = new Map<string, { completed: number; total: number; status?: string; error?: string }>()
  let nativeJobsQueried = false
  try {
    const native = await nativeModule()
    const pending = (await native?.pendingAudioDownloadJobs()) ?? []
    nativeJobsQueried = true
    for (const job of pending) nativeJobs.set(job.id, job)
    for (const job of pending) {
      if (job.status !== 'failed' && job.total > 0 && job.completed >= job.total) {
        await native?.assembleAudioDownloadJob(job.id)
      }
    }
  } catch {
    // Keep pending journal evidence when native state is temporarily unavailable.
  }
  // Unknown native state cannot prove failure or reserve a recovered duplicate.
  // Leave both current and legacy journals untouched, and let the next request retry.
  if (!nativeJobsQueried) return false

  for (const record of records) {
    const { key, entry, attemptId, state } = record
    let fileSize = 0
    try {
      const file = new File(downloadsDir(), entry.fileName)
      if (file.exists) fileSize = validatedFileSize(entry)
    } catch {
      // 忽略单条
    }
    if (fileSize > 0) {
      pendingSettlements.set(key, entry)
      if (settle(key, fileSize, attemptId)) continue
      // Keep evidence when bytes are complete but a durable registration write failed.
      continue
    }

    if (state === 'completed') {
      // The sidecar says the file completed but it is gone or unreadable.
      try { journalRecordFile(key, attemptId).delete() } catch { /* best effort */ }
      continue
    }

    const nativeJob = nativeJobs.get(attemptId)
    if (nativeJob?.status === 'failed' || (!nativeJob && nativeJobsQueried && !attemptsById.has(attemptId))) {
      fail(key, nativeJob?.error ?? '下载在应用关闭期间失败，请重试', attemptId)
    } else if ((nativeJob && nativeJob.status !== 'failed') || attemptsById.has(attemptId) || !nativeJobsQueried) {
      pendingSettlements.set(key, entry)
      if (!attemptsByKey.has(key)) jobs.set(key, { key, state: 'downloading', completed: nativeJob?.completed ?? 0, total: nativeJob?.total ?? 1 })
    }
  }

  // Restore old journal/native jobs that used the stable download key as their native id.
  for (const [key, entry] of Object.entries(loadJournal())) {
    if (records.some((record) => record.key === key)) continue
    const file = new File(downloadsDir(), entry.fileName)
    if (file.exists && validatedFileSize(entry) > 0) {
      pendingSettlements.set(key, entry)
      if (settle(key, validatedFileSize(entry))) continue
      continue
    }
    const nativeJob = nativeJobs.get(key)
    if (nativeJob?.status === 'pending') {
      pendingSettlements.set(key, entry)
      jobs.set(key, { key, state: 'downloading', completed: nativeJob.completed, total: nativeJob.total })
    } else {
      fail(key, nativeJob?.error ?? '旧版下载无法恢复，请重试')
    }
  }

  // Recovered native jobs must reserve both the stable key and one global slot.
  for (const record of records) {
    if (record.state !== 'pending') continue
    const nativeJob = nativeJobs.get(record.attemptId)
    if ((nativeJobsQueried && nativeJob?.status !== 'pending') || (!nativeJob && nativeJobsQueried) || attemptsById.has(record.attemptId)) continue
    if (validatedFileSize(record.entry) > 0 || loadIndex().entries[record.key]) continue
    registerRecoveredNativeJob(record.attemptId, record.key)
    const duplicate = attemptsByKey.get(record.key)
    if (duplicate && !duplicate.active) {
      duplicate.cancelled = true
      const queueIndex = queuedAttempts.indexOf(duplicate)
      if (queueIndex >= 0) queuedAttempts.splice(queueIndex, 1)
      finishAttempt(duplicate)
    }
  }
  for (const key of Object.keys(loadJournal())) {
    if (records.some((record) => record.key === key)) continue
    if ((!nativeJobsQueried || nativeJobs.get(key)?.status === 'pending') && !loadIndex().entries[key]) registerRecoveredNativeJob(key, key)
  }

  // Ensure a corrupt or stale index is rewritten from the completed recovery records.
  if (persistIndex()) emit()
  emit()
  return nativeJobsQueried
}

/** 仅测试/调试用：清掉内存缓存（不动磁盘） */
export function __resetDownloadMemoryForTests(): void {
  index = null
  journal = null
  jobs.clear()
  pendingSettlements.clear()
  attemptsByKey.clear()
  attemptsById.clear()
  recoveredNativeById.clear()
  recoveredNativeByKey.clear()
  attemptOptions.clear()
  queuedAttempts.length = 0
  activeDownloadCount = 0
  queueSuspended = false
  reconciliationComplete = false
  reconciliationBlocked = false
  reconciliationPromise = null
  cancelledAttemptFiles.clear()
  listeners.clear()
  unsubscribeNative = null
  nativeSubscriptionPromise = null
  nativeModulePromise = null
}

export const DOWNLOAD_DIRECTORY_NAME = DOWNLOAD_DIR
