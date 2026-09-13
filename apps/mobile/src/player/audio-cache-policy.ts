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

/**
 * 转码产物（服务端 HLS 拼接出的单文件）必须使用的后缀。
 *
 * **绝不能沿用源格式的后缀。** 实测方法：把同一份 fMP4+FLAC 字节复制成不同后缀，
 * 用 AVFoundation（iOS 上 RNTP 的真实播放框架）验证：
 *
 * | 后缀 | 可播 | | 后缀 | 可播 |
 * | --- | --- | --- | --- | --- |
 * | `.mp4` / `.m4a` / `.mov` | ✅ | | `.wma` / `.ape` / `.dsf` / `.dff` | ❌ |
 * | `.flac` / `.mp3` | ✅（靠内容嗅探，但走了另一条解析路径，时长读数都变了） | | `.wv` / `.tak` / `.tta` | ❌ |
 *
 * 要命的地方在于：**播不了的那组后缀，恰好就是需要转码的那组格式。**
 * 所以如果沿用源格式后缀（`cacheFileName(serverId, trackId, item.format)` 会这么做），
 * 结果是必然 100% 失败 —— 而且是「文件内容完全正确、就是播不出来」这种最难排查的失败。
 *
 * 用 `.mp4` 而不是 `.m4a`：容器是 fragmented MP4，两者同族都能播，
 * 但 `.mp4` 更贴合实际内容，也不会让人误以为是普通的 m4a 单文件。
 */
export const TRANSCODE_CACHE_FORMAT = 'mp4'

/**
 * 转码产物的缓存文件名。
 * 与原始文件使用**不同后缀**，因此同一首歌的原始文件与转码产物可以共存、不会互相覆盖。
 */
export function transcodeCacheFileName(serverId: string, trackId: string): string {
  return cacheFileName(serverId, trackId, TRANSCODE_CACHE_FORMAT)
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
 * 挑出为了容纳 incomingBytes 或满足首数上限需要删掉的条目（最久未用的先删）。
 * protectedKeys 里的条目绝不删：正在播放的那首、以及队列里马上要播的几首。
 * budgetBytes: 0 代表无容量限制
 * countLimit: 0 代表无首数限制
 */
export function pickEvictions(
  entries: CacheEntry[],
  budgetBytes: number,
  incomingBytes: number,
  protectedKeys: ReadonlySet<string> = new Set(),
  countLimit: number = 0,
): string[] {
  const candidates = entries
    .filter((entry) => !protectedKeys.has(entry.key))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)

  const victims = new Set<string>()

  // 1. 容量超限淘汰（budgetBytes > 0 时生效）
  if (budgetBytes > 0) {
    let over = totalBytes(entries) + Math.max(0, incomingBytes) - budgetBytes
    for (const entry of candidates) {
      if (over <= 0) break
      victims.add(entry.key)
      over -= Math.max(0, entry.size)
    }
  }

  // 2. 首数超限淘汰（countLimit > 0 时生效）
  if (countLimit > 0) {
    let projectedCount = entries.length - victims.size + (incomingBytes > 0 ? 1 : 0)
    for (const entry of candidates) {
      if (projectedCount <= countLimit) break
      if (!victims.has(entry.key)) {
        victims.add(entry.key)
        projectedCount--
      }
    }
  }

  return Array.from(victims)
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

// ── 转码产物（服务端 HLS 拼接出的单文件）的完整性校验 ────────────────────────

export interface TranscodeProductShape {
  /** 产物顶层的 `moof` box 数量 */
  moofCount: number
  /** 产物顶层的 `mdat` box 数量 */
  mdatCount: number
  /** 下载到的媒体分片里，**非空**（即含 `moof`）的片数 */
  nonEmptySegmentCount: number
  /** 产物实际时长（秒）。拿不到就传 undefined，此时跳过时长校验 */
  actualDurationSeconds?: number
  /** 源曲目时长（秒） */
  sourceDurationSeconds: number
}

export type TranscodeValidation = { ok: true } | { ok: false; reason: string }

/**
 * 校验拼接出的转码产物是否可信 —— 决定要不要把它写进缓存。
 *
 * **为什么必须用「分片计数 + 时长」两个判据**（都来自对真实服务器的实测）：
 *
 * | 判据 | 抓什么 | 单独用为什么不够 |
 * | --- | --- | --- |
 * | `moof` 计数 == 非空分片数 | 丢片 / 重复（**精确**） | 抓不到顺序错误：倒序时分片数不变 |
 * | 时长 vs 源时长 | 顺序错误 / 静默损坏 | 抓不到单个丢片：漏一个 2 秒分片在 4 分钟曲目里只占 0.8% |
 *
 * 两个容易踩的坑：
 * - **空分片是合法的**：音频正好落在分片边界时会有只含 `styp`、没有 `moof` 的尾片，
 *   所以要比「非空分片数」，直接拿播放列表分片数比会误报。
 * - **时长容差不能紧**：服务端对某些源会重采样到非整数比的目标采样率，
 *   产物时长本身就能差 1%（实测 DSD256 → 384kHz 差 1.65 秒 / 233 秒），
 *   这不是拼接错误。所以用「max(2 秒, 源时长的 2%)」这种相对容差。
 */
export function validateTranscodeProduct(shape: TranscodeProductShape): TranscodeValidation {
  const { moofCount, mdatCount, nonEmptySegmentCount, actualDurationSeconds, sourceDurationSeconds } = shape

  if (moofCount <= 0) {
    return { ok: false, reason: '产物里没有任何音频分片' }
  }
  if (moofCount !== mdatCount) {
    return { ok: false, reason: `moof/mdat 不配平（${moofCount}/${mdatCount}），文件被截断` }
  }
  if (moofCount !== nonEmptySegmentCount) {
    return {
      ok: false,
      reason: `分片数不一致：产物 ${moofCount} 片，非空分片 ${nonEmptySegmentCount} 片（丢片或重复）`,
    }
  }
  if (actualDurationSeconds !== undefined && sourceDurationSeconds > 0) {
    const tolerance = durationToleranceSeconds(sourceDurationSeconds)
    const delta = Math.abs(actualDurationSeconds - sourceDurationSeconds)
    if (delta > tolerance) {
      return {
        ok: false,
        reason: `时长偏差过大：产物 ${actualDurationSeconds.toFixed(2)}s，源 ${sourceDurationSeconds.toFixed(2)}s（差 ${delta.toFixed(2)}s）`,
      }
    }
  }
  return { ok: true }
}

/** 时长容差：短样本给 2 秒下限，长曲目按 2% 相对值（服务端重采样误差本身可达 1%） */
function durationToleranceSeconds(sourceDurationSeconds: number): number {
  return Math.max(2, sourceDurationSeconds * 0.02)
}

/**
 * 下载**之前**的预校验：播放列表的 `Σ EXTINF` 应该与服务端记录的源时长一致。
 *
 * 为什么值得单独查一次：如果列表本身就不对（例如服务端返回了别的曲目、或时长元数据
 * 与音频不匹配），后面下载全部分片只是在浪费流量 —— 提前失败更划算。
 * 实测正常情况偏差在毫秒级（233.732 vs 233.731）。
 */
export function validatePlaylistAgainstSource(
  playlistDurationSeconds: number,
  sourceDurationSeconds: number,
): TranscodeValidation {
  if (!(playlistDurationSeconds > 0)) {
    return { ok: false, reason: '播放列表没有可用的时长（分片缺失或 EXTINF 异常）' }
  }
  if (!(sourceDurationSeconds > 0)) {
    // 源时长未知就不做这项校验，不能因此拒绝缓存
    return { ok: true }
  }
  const tolerance = durationToleranceSeconds(sourceDurationSeconds)
  const delta = Math.abs(playlistDurationSeconds - sourceDurationSeconds)
  if (delta > tolerance) {
    return {
      ok: false,
      reason: `播放列表时长 ${playlistDurationSeconds.toFixed(2)}s 与源 ${sourceDurationSeconds.toFixed(2)}s 相差过大（${delta.toFixed(2)}s）`,
    }
  }
  return { ok: true }
}
