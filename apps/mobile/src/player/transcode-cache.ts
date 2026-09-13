import { File } from 'expo-file-system'
import { isAutoCacheEnabled } from '../lib/cache-preferences'
import {
  transcodeCacheFileName,
  validatePlaylistAgainstSource,
  validateTranscodeProduct,
} from './audio-cache-policy'
import {
  cacheAudioDirectory,
  cachedUriByName,
  registerCacheEntry,
  removeCacheEntry,
  reserveCacheSpace,
} from './audio-cache'
import { parseHlsPlaylist, type HlsPlaylist } from './hls-playlist'
import { countBoxes } from './mp4-boxes'

/**
 * 把服务端转码产物（HLS 分片）缓存成一个可本地播放的单文件。
 *
 * ── 为什么值得做 ────────────────────────────────────────────────────────────
 * 服务端转码**没有任何缓存**：同一首 WMA 每播一次就要 NAS 重转一次。
 * 把产物拼成单文件缓存下来，就变成「只转一次」，同时顺带拿到了离线播放能力。
 *
 * ── 为什么是纯 JS ───────────────────────────────────────────────────────────
 * 转码产物是 **VOD** 的 fMP4 HLS（`#EXT-X-ENDLIST`、无加密、无 BYTERANGE），
 * 所以 `init.mp4 + 按序分片` 直接字节拼接就是一个合法的 fragmented MP4。
 * 实测 AVFoundation 判定可播并完整解码（见 `docs/方案评估-…-2026-09-13.md` §8）。
 * `expo-file-system` 的 `File.write(bytes, { append: true })` 支持增量追加，
 * 因此可以边下边写、内存只占一个分片 —— **不需要任何原生模块**。
 *
 * ── 设计约束 ───────────────────────────────────────────────────────────────
 * - **绝不阻塞播放**：全程 fire-and-forget，任何失败只 warn。
 * - **写到 `.part` 再改名**：半成品不会被当成有效缓存（`syncWithDisk` 会跳过 `.part`）。
 * - **索引/配额/淘汰复用 `audio-cache`**：否则两套缓存互相看不见对方占用。
 */

/** 分片可能"还没生成"，此时服务端返回 404（实测 DSD256 稳定复现），需要重试 */
const SEGMENT_RETRY_ATTEMPTS = 6
const SEGMENT_RETRY_DELAY_MS = 1_000
/** 单个请求超时：分片不大，给 15 秒足够 */
const REQUEST_TIMEOUT_MS = 15_000
/** 转码缓存的并发上限：这是一件很重的事，不与正在播放的那首抢带宽 */
const MAX_PARALLEL = 1

export interface TranscodeCacheInput {
  serverId: string
  trackId: string
  /** 转码会话给出的 m3u8 地址 */
  playlistUrl: string
  /** 请求分片需要的鉴权头（飞牛要求 m3u8 与分片都带） */
  headers?: Record<string, string>
  /** 服务端记录的源时长（秒），用于下载前的预校验 */
  sourceDurationSeconds: number
  /** 返回 true 时立即放弃（切歌 / 会话已失效） */
  shouldAbort?: () => boolean
}

let inflight = 0
const running = new Map<string, Promise<void>>()
/** 清空缓存时自增，让在途任务自行放弃 */
let epoch = 0

/** 命中转码产物缓存则返回本地 `file://` 地址 */
export function cachedTranscodeUri(serverId: string, trackId: string): string | undefined {
  return cachedUriByName(transcodeCacheFileName(serverId, trackId))
}

/**
 * 作废某个曲目的转码产物。
 * 用在「缓存文件播放失败」时：删掉它并回落服务端转码，避免下次又拿到同一个坏文件。
 */
export function invalidateTranscodeProduct(serverId: string, trackId: string): void {
  removeCacheEntry(transcodeCacheFileName(serverId, trackId))
}

/** 清空缓存时调用，让在途任务放弃 */
export function abortTranscodeCaching(): void {
  epoch += 1
}

/**
 * 开始缓存某首曲目的转码产物。**不 await 它的结果**（调用方 fire-and-forget）。
 * 同一首曲目已在跑时直接返回，不会重复下载。
 */
export function startTranscodeCaching(input: TranscodeCacheInput): void {
  if (!isAutoCacheEnabled()) return
  const name = transcodeCacheFileName(input.serverId, input.trackId)
  if (running.has(name)) return
  if (inflight >= MAX_PARALLEL) return

  const task = run(input, name)
    .catch((error: unknown) => {
      // 缓存是加速与省 CPU 的手段，失败绝不影响播放
      console.warn('转码产物缓存失败', error)
    })
    .finally(() => {
      inflight -= 1
      running.delete(name)
    })
  inflight += 1
  running.set(name, task)
}

async function run(input: TranscodeCacheInput, name: string): Promise<void> {
  const { playlistUrl, headers, sourceDurationSeconds, shouldAbort } = input
  const startedEpoch = epoch
  const dir = cacheAudioDirectory()
  const finalFile = new File(dir, name)
  if (finalFile.exists) return

  const playlist = await fetchPlaylist(playlistUrl, headers)
  const precheck = validatePlaylistAgainstSource(playlist.durationSeconds, sourceDurationSeconds)
  if (!precheck.ok) {
    console.warn(`转码产物预校验未通过，跳过缓存：${precheck.reason}`)
    return
  }

  const part = new File(dir, `${name}.part`)
  try {
    if (part.exists) part.delete()
    part.create({ intermediates: true, overwrite: true })

    let moofCount = 0
    let mdatCount = 0
    let nonEmptySegments = 0
    let writtenBytes = 0

    const writePart = (bytes: Uint8Array): void => {
      part.write(bytes, { append: true })
      writtenBytes += bytes.byteLength
    }

    if (playlist.initUri) {
      writePart(await fetchSegmentBytes(playlist.initUri, headers, 'init'))
    }

    for (const [index, uri] of playlist.segmentUris.entries()) {
      if (startedEpoch !== epoch || shouldAbort?.()) {
        // 切歌 / 清空缓存：半成品直接丢掉，不要留下坏文件
        discard(part)
        return
      }
      const bytes = await fetchSegmentBytes(uri, headers, `分片 ${index + 1}/${playlist.segmentUris.length}`)
      writePart(bytes)
      const moof = countBoxes(bytes, 'moof')
      moofCount += moof
      mdatCount += countBoxes(bytes, 'mdat')
      if (moof > 0) nonEmptySegments += 1
    }

    /**
     * 产物校验：用「分片计数」这一精确判据。
     *
     * 不传 `actualDurationSeconds` 是**刻意的** —— 在 JS 里拿产物真实时长需要解析
     * MP4 的 `mvhd`/`sidx`，成本高且对 fMP4 不可靠；而**顺序由构造保证**
     * （严格按播放列表顺序写入），所以时长交叉校验在这里没有必要。
     * 下载前的 `validatePlaylistAgainstSource` 已经把「列表本身不对」挡掉了。
     */
    const validation = validateTranscodeProduct({
      moofCount,
      mdatCount,
      nonEmptySegmentCount: nonEmptySegments,
      sourceDurationSeconds,
    })
    if (!validation.ok) {
      console.warn(`转码产物校验未通过，丢弃：${validation.reason}`)
      discard(part)
      return
    }

    // 落到最终文件名前才腾空间，避免为一次可能失败的下载提前删掉别人的缓存
    reserveCacheSpace(writtenBytes, name)
    if (finalFile.exists) finalFile.delete()
    await part.move(finalFile)
    registerCacheEntry(name, writtenBytes)
  } catch (error) {
    discard(part)
    throw error
  }
}

function discard(part: File): void {
  try {
    if (part.exists) part.delete()
  } catch {
    // 删不掉也无所谓：`syncWithDisk` 会跳过 `.part`
  }
}

async function fetchPlaylist(url: string, headers?: Record<string, string>): Promise<HlsPlaylist> {
  const text = await fetchText(url, headers, '播放列表')
  return parseHlsPlaylist(text, url)
}

/**
 * 取一个分片的字节。
 *
 * **404 要重试**：`POST /track/transcode` 返回 `status:'success'` 只代表任务已建，
 * 分片可能还没生成 —— 实测源越重越容易踩到（DSD256 稳定复现，等约 2 秒即好）。
 * **410 不重试**：那是任务已被服务端回收，继续重试没有意义。
 */
async function fetchSegmentBytes(url: string, headers: Record<string, string> | undefined, label: string): Promise<Uint8Array> {
  let lastStatus = 0
  for (let attempt = 1; attempt <= SEGMENT_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetchWithTimeout(url, headers)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    }
    lastStatus = response.status
    if (response.status !== 404) break
    if (attempt < SEGMENT_RETRY_ATTEMPTS) {
      await delay(SEGMENT_RETRY_DELAY_MS * attempt)
    }
  }
  throw new Error(`${label} HTTP ${lastStatus}`)
}

async function fetchText(url: string, headers: Record<string, string> | undefined, label: string): Promise<string> {
  const response = await fetchWithTimeout(url, headers)
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`)
  return response.text()
}

/** 自己拼超时，不依赖 `AbortSignal.timeout`（Hermes 上不保证存在） */
async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...(headers ? { headers } : {}), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
