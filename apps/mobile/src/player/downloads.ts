import { Directory, File, Paths } from 'expo-file-system'
import type { Track } from '@qj/core-domain'
import type { MusicProvider } from '@qj/provider-api'
import {
  assertNamespacesDisjoint,
  downloadFileName,
  downloadKey,
  type DownloadState,
} from '@/lib/download-policy'
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
 *    Android 目前没有原生实现（`hasNativeDownloader()` 为 false），回退到前台下载。
 * 2. **需要转码的曲目**：产物是 HLS 分片，见 `docs/执行计划-2026-09-15.md` 第 7 轮 ——
 *    服务端转码会话要 10 秒心跳，App 被挂起时没人心跳，所以这条路径**下一步单独做**。
 *    现在遇到这类曲目会明确失败（`reason` 里写清楚），不静默吞掉。
 */

const DOWNLOAD_DIR = 'downloads'
/** 播放缓存的目录名（`player/audio-cache.ts`）。这里复制一份只为了断言两者不同 —— 见下方。 */
const CACHE_DIR = 'audio'

export interface DownloadEntry {
  /** `serverId:trackId` */
  key: string
  serverId: string
  trackId: string
  title: string
  artistText: string
  coverId?: string
  fileName: string
  bytes: number
  downloadedAt: number
  /** 下载时的格式（播放时决定 contentType） */
  format?: string
  /**
   * 完整领域曲目。
   *
   * 管理页要能**离线播放**，而 `playTrackList` 的入参是 `Track[]` —— 只存标题/艺术家
   * 就播不了（与队列页历史行同一个问题，那里也是靠 `QueueItem.track` 解决的）。
   */
  track?: Track
}

/** 正在下载的作业（仅内存；App 重启后由 native 的 pendingJobs + 磁盘对账恢复） */
export interface DownloadJobState {
  key: string
  state: DownloadState
  completed: number
  total: number
  error?: string
}

interface DownloadIndex {
  version: 1
  entries: Record<string, DownloadEntry>
}

type Listener = () => void

let index: DownloadIndex | null = null
const jobs = new Map<string, DownloadJobState>()
const listeners = new Set<Listener>()
let unsubscribeNative: (() => void) | null = null
/** 结算后要回写登记表的「等成品文件出现」的作业：key → 元数据 */
const pendingSettlements = new Map<string, DownloadEntry>()

assertNamespacesDisjoint(CACHE_DIR, DOWNLOAD_DIR)

function downloadsDir(): Directory {
  const dir = new Directory(Paths.document, DOWNLOAD_DIR)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

function indexFile(): File {
  return new File(downloadsDir(), 'index.json')
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
  return index
}

function persistIndex(): void {
  const current = loadIndex()
  try {
    const file = indexFile()
    if (!file.exists) file.create({ intermediates: true, overwrite: true })
    file.write(JSON.stringify(current))
  } catch {
    // 写失败只影响登记表精度，下次对账会用磁盘补
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
  return entryFor(serverId, trackId) !== undefined
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
    if (file.exists) return file.uri
  } catch {
    return undefined
  }
  delete loadIndex().entries[entry.key]
  persistIndex()
  emit()
  return undefined
}

/** 下载一首（目前只支持直连原文件路径；转码路径见文件头注释） */
export async function downloadTrack(options: {
  provider: MusicProvider
  serverId: string
  track: Track
  /** 需要转码的曲目（设备原生解不了）走另一条路，交给调用方提示 */
  requiresTranscode: boolean
}): Promise<void> {
  const { provider, serverId, track, requiresTranscode } = options
  const key = downloadKey(serverId, track.id)
  const fileName = downloadFileName(serverId, track.id, track.audio?.format)
  const entry: DownloadEntry = {
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

  if (isDownloaded(serverId, track.id)) return

  if (requiresTranscode) {
    jobs.set(key, { key, state: 'failed', completed: 0, total: 0, error: '需要服务端转码，暂不支持下载' })
    emit()
    throw new Error('这首歌需要服务端转码，暂时还不能下载')
  }

  const stream = await provider.stream(track.id, { quality: 'original', allowTranscode: false })
  // 先把元数据记成「等待成品」，App 被杀导致 JS 观察不到完成时，靠对账补登记
  pendingSettlements.set(key, entry)
  jobs.set(key, { key, state: 'downloading', completed: 0, total: 1 })
  emit()
  await ensureNativeSubscription()

  const destination = new File(downloadsDir(), fileName)
  const partsDirectory = new Directory(downloadsDir(), `parts-${key.replace(/[^\w-]/g, '_')}`)
  if (!partsDirectory.exists) partsDirectory.create({ intermediates: true })

  // 单文件也是一次「一个分片的作业」：复用同一条原生链路（唯一差别是分片数为 1）
  const native = await nativeModule()
  const started = await (native?.startAudioDownloadJob({
    id: key,
    urls: [stream.url],
    headers: stream.headers ?? {},
    destination: destination.uri.replace('file://', ''),
    partsDirectory: partsDirectory.uri.replace('file://', ''),
  }) ?? false)
  if (started) return

  // 没有原生实现（Android）：直接下（前台有效，切后台会被系统挂起）
  try {
    const file = await File.downloadFileAsync(stream.url, destination, {
      headers: stream.headers,
      idempotent: true,
    })
    settle(key, file.size ?? 0)
  } catch (error) {
    fail(key, error instanceof Error ? error.message : '下载失败')
    throw error
  }
}

/** 删除单条下载（连带删文件；删不掉也把登记项清掉，避免显示假状态） */
export function removeDownload(key: string): void {
  const current = loadIndex()
  const entry = current.entries[key]
  if (entry) {
    try {
      const file = new File(downloadsDir(), entry.fileName)
      if (file.exists) file.delete()
    } catch {
      // 忽略：登记项照样删，用户看到的就是「已删除」
    }
    delete current.entries[key]
    persistIndex()
  }
  pendingSettlements.delete(key)
  jobs.delete(key)
  emit()
}

/** 全部删除 */
export function clearDownloads(): void {
  for (const entry of listDownloads()) removeDownload(entry.key)
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
  } catch {
    // 忽略
  }
  emit()
}

// ---- 完成 / 失败 的内部结算 ----

function settle(key: string, bytes: number): void {
  const pending = pendingSettlements.get(key)
  if (!pending) return
  const current = loadIndex()
  current.entries[key] = { ...pending, bytes, downloadedAt: Date.now() }
  pendingSettlements.delete(key)
  persistIndex()
  jobs.delete(key)
  // 分片目录用完就清掉：成品已经拼好了，留着只会占空间（且用户看到的是「下载目录里多了一堆东西」）
  cleanupPartsDirectory(key)
  emit()
}

function cleanupPartsDirectory(key: string): void {
  try {
    const dir = new Directory(downloadsDir(), `parts-${key.replace(/[^\w-]/g, '_')}`)
    if (dir.exists) dir.delete()
  } catch {
    // 清不掉不影响功能
  }
}

function fail(key: string, reason: string): void {
  pendingSettlements.delete(key)
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
  const native = await nativeModule()
  if (!native?.hasNativeDownloader()) return
  unsubscribeNative = native.subscribeAudioDownload({
    onProgress: ({ id, completed, total }) => {
      jobs.set(id, { key: id, state: 'downloading', completed, total })
      emit()
    },
    onFinished: ({ id, bytes }) => settle(id, bytes),
    onFailed: ({ id, reason }) => fail(id, reason),
  })
}

/**
 * 启动对账。
 *
 * App 被杀死期间，系统可能已经把分片下完（甚至已经拼好），而 JS 当时不在场 ——
 * 这里把它们补登记进 `index.json`，否则会出现「文件在磁盘上、App 里却显示未下载」。
 */
export async function reconcileDownloads(): Promise<void> {
  await ensureNativeSubscription()
  try {
    // 分片已齐的先拼成成品（原生侧会挑那些齐了的）
    const native = await nativeModule()
    const pending = (await native?.pendingAudioDownloadJobs()) ?? []
    for (const job of pending) {
      if (job.total > 0 && job.completed >= job.total) {
        await native?.assembleAudioDownloadJob(job.id)
      }
    }
  } catch {
    // 原生不可用（Android）时没有对账可做
  }

  // 成品文件已经在 → 补登记
  for (const [key, entry] of [...pendingSettlements.entries()]) {
    try {
      const file = new File(downloadsDir(), entry.fileName)
      if (file.exists && (file.size ?? 0) > 0) {
        settle(key, file.size ?? 0)
      }
    } catch {
      // 忽略单条
    }
  }
  emit()
}

/** 仅测试/调试用：清掉内存缓存（不动磁盘） */
export function __resetDownloadMemoryForTests(): void {
  index = null
  jobs.clear()
  pendingSettlements.clear()
  listeners.clear()
  unsubscribeNative = null
  nativeModulePromise = null
}

export const DOWNLOAD_DIRECTORY_NAME = DOWNLOAD_DIR
