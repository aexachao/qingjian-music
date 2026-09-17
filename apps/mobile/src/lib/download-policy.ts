/**
 * 下载的纯逻辑（不 import react-native / expo，可直接单测）。
 *
 * ── 下载与「播放缓存」是两件事 ──────────────────────────────────────────────
 * `player/audio-cache.ts` 是**播放时的自动缓存**：会被配额淘汰、用户看不到具体条目、
 * 设置里能一键清空。下载是**用户显式要求的**：不参与淘汰、只有用户能删、离线必须能放。
 * 所以两者**目录分开、登记表分开**（`cacheFileName` 与 `downloadFileName` 的命名空间
 * 也必须分开 —— 见 `isDownloadName` / `assertNamespacesDisjoint`，有单测钉住）。
 */

export type DownloadState = 'idle' | 'downloading' | 'downloaded' | 'failed'

/** 登记表与 UI 用的键：同一台服务器上的同一首歌算同一条 */
export function downloadKey(serverId: string, trackId: string): string {
  return `${serverId}:${trackId}`
}

/** 下载文件名：与播放缓存（`cacheFileName`，前缀 `audio-`）刻意用不同前缀 */
export function downloadFileName(serverId: string, trackId: string, format?: string): string {
  return `dl-${sanitize(serverId)}-${sanitize(trackId)}.${safeExtension(format)}`
}

/**
 * 转码产物的下载文件名。
 * 产物是 fMP4（init.mp4 + 分片拼接后的整文件），所以扩展名固定 `mp4`。
 */
export function downloadTranscodeFileName(serverId: string, trackId: string): string {
  return `dl-${sanitize(serverId)}-${sanitize(trackId)}.mp4`
}

/** 分片临时目录名（同一个下载任务的所有分片放一起，按序号排序拼接） */
export function downloadPartsDirName(serverId: string, trackId: string): string {
  return `parts-${sanitize(serverId)}-${sanitize(trackId)}`
}

/** 分片文件名：`0001.part`、`0002.part`…（补零保证字典序 = 播放顺序） */
export function downloadPartName(index: number): string {
  return `${String(index).padStart(4, '0')}.part`
}

/** 从文件名取回分片序号（对账时按序号判断缺哪一片） */
export function downloadPartIndex(name: string): number | undefined {
  const match = /^(\d{4})\.part$/.exec(name)
  if (!match) return undefined
  const index = Number(match[1])
  return Number.isFinite(index) ? index : undefined
}

/** 这个文件名是不是下载产物（用来把下载目录里的东西和缓存目录区分开） */
export function isDownloadName(name: string): boolean {
  return name.startsWith('dl-') || name.startsWith('parts-')
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** 扩展名：与原文件一致（直连下载保留原格式），未知则 `bin` */
export function safeExtension(format?: string): string {
  if (!format) return 'bin'
  const cleaned = format.toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned.length > 0 && cleaned.length <= 5 ? cleaned : 'bin'
}

/** 状态 → 菜单里的动作文案（`···` 菜单按状态二选一） */
export function downloadActionLabel(state: DownloadState): string {
  switch (state) {
    case 'downloaded':
      return '删除下载'
    case 'downloading':
      return '取消下载'
    default:
      return '下载'
  }
}

/** 状态 → 无障碍/文案用的描述 */
export function downloadStateText(state: DownloadState): string {
  switch (state) {
    case 'downloading':
      return '下载中'
    case 'downloaded':
      return '已下载'
    case 'failed':
      return '下载失败'
    default:
      return '未下载'
  }
}

/** 进度百分比（0~100）。total <= 0 时给 0，避免除零与 100% 的假象 */
export function downloadPercent(done: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const clamped = Math.min(Math.max(done, 0), total)
  return Math.round((clamped / total) * 100)
}

export interface BatchDownloadResult {
  /** 成功进入下载队列（或已下载）的曲目数 */
  started: number
  /** 失败/跳过（含原因） */
  failed: { trackId: string; reason: string }[]
}

/** 批量下载的结果汇总（多选动作栏用；**失败要说失败**，不能只报成功数） */
export function summarizeBatch(
  results: readonly { trackId: string; ok: boolean; reason?: string }[],
): BatchDownloadResult {
  const failed: { trackId: string; reason: string }[] = []
  let started = 0
  for (const item of results) {
    if (item.ok) {
      started += 1
    } else {
      failed.push({ trackId: item.trackId, reason: item.reason ?? '未知原因' })
    }
  }
  return { started, failed }
}

/** 批量下载的提示文案：全成功、部分成功、全失败三种口径 */
export function batchDownloadMessage(result: BatchDownloadResult): string {
  const failed = result.failed.length
  if (failed === 0) return result.started > 0 ? `已开始下载 ${result.started} 首` : '没有可下载的曲目'
  if (result.started === 0) return `${failed} 首下载失败：${result.failed[0]?.reason ?? ''}`
  return `已开始下载 ${result.started} 首，${failed} 首失败`
}

/**
 * 「下载目录」与「缓存目录」必须是两个目录 —— 下载不能被缓存淘汰清掉。
 * 这条不变量放在纯逻辑里，架构上先钉死，免得以后有人图省事把两者合并。
 */
export function assertNamespacesDisjoint(cacheDir: string, downloadDir: string): void {
  if (cacheDir === downloadDir) {
    throw new Error('下载目录不能与播放缓存目录相同：下载不参与缓存淘汰，必须物理分开')
  }
}
