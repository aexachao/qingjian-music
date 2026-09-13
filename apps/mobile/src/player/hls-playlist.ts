/**
 * HLS 点播播放列表解析（用于把服务端转码产物缓存成单文件）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 服务端转码（飞牛 `/track/transcode`）的产物是 **HLS**：一个 `init.mp4`（EXT-X-MAP）
 * 加上一串 fMP4 分片。它不是一个可以直接下载的单文件，所以「缓存转码产物」这件事
 * 必须先能正确读懂播放列表。
 *
 * 实测该播放列表是 **VOD**（`#EXT-X-PLAYLIST-TYPE:VOD` + `#EXT-X-ENDLIST`）、
 * **无加密**（无 `#EXT-X-KEY`）、**无按字节区间**（无 `#EXT-X-BYTERANGE`），
 * 因此 `init.mp4 + 分片按序拼接` 就是一个合法的 fragmented MP4，
 * 播放器可以当**本地文件**直接播 —— 这是整套方案成立的前提。
 *
 * 本模块只做「解析 + 解析成绝对地址」，不碰网络、不碰文件系统，
 * 所以能直接单测（含真实播放列表文本）。
 */

export interface HlsPlaylist {
  /** 初始化分片（`#EXT-X-MAP`）的绝对地址；没有该标签时为 undefined */
  initUri?: string
  /** 媒体分片，**按播放顺序**排列的绝对地址 */
  segmentUris: string[]
  /** 各分片时长之和（秒）；用于和最终文件的时长交叉校验 */
  durationSeconds: number
  /**
   * 是否是一个完整的点播列表（出现 `#EXT-X-ENDLIST`）。
   * 为 false 说明这可能是直播/滚动窗口，**拼接出来的文件不完整**，调用方必须放弃缓存。
   */
  isComplete: boolean
}

/** 不支持的播放列表特性 —— 遇到必须显式失败，而不是拼出一个坏文件 */
export class UnsupportedPlaylistError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedPlaylistError'
  }
}

/**
 * 解析 `KEY=VALUE,KEY=VALUE` 形式的属性列表（如 `#EXT-X-MAP:URI="x.mp4"`）。
 * 值可能带引号，引号内的逗号不分割。
 */
function parseAttributeList(input: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  let index = 0
  while (index < input.length) {
    const eq = input.indexOf('=', index)
    if (eq < 0) break
    const key = input.slice(index, eq).trim().toUpperCase()
    let cursor = eq + 1
    let value: string
    if (input[cursor] === '"') {
      const end = input.indexOf('"', cursor + 1)
      if (end < 0) break
      value = input.slice(cursor + 1, end)
      cursor = end + 1
    } else {
      let end = input.indexOf(',', cursor)
      if (end < 0) end = input.length
      value = input.slice(cursor, end).trim()
      cursor = end
    }
    if (key) attributes[key] = value
    // 跳过逗号与空白
    while (cursor < input.length && (input[cursor] === ',' || input[cursor] === ' ')) cursor += 1
    index = cursor
  }
  return attributes
}

/** 把播放列表里的（可能是相对的）地址解析成绝对地址 */
export function resolveUri(uri: string, baseUrl: string): string {
  // 已经是绝对地址（含协议或协议相对）时原样返回
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri) || uri.startsWith('//')) return uri
  const base = new URL(baseUrl)
  // `new URL(relative, base)` 会以 base 的目录为基准，正好符合 HLS 的解析规则
  return new URL(uri, base).toString()
}

/**
 * 解析 HLS 点播播放列表。
 *
 * @param text 播放列表原文
 * @param baseUrl 播放列表自身的绝对地址（用于把相对分片地址解析成绝对地址）
 */
export function parseHlsPlaylist(text: string, baseUrl: string): HlsPlaylist {
  // 统一换行：服务端可能是 CRLF
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  let initUri: string | undefined
  let durationSeconds = 0
  let isComplete = false
  const segmentUris: string[] = []
  /** 上一条 `#EXTINF` 的时长，用于给紧随其后的分片地址记账 */
  let pendingDuration: number | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('#')) {
      const upper = line.toUpperCase()

      // 加密播放列表：分片是密文，简单拼接得到的文件不可播 —— 明确拒绝
      if (upper.startsWith('#EXT-X-KEY')) {
        throw new UnsupportedPlaylistError('播放列表带 #EXT-X-KEY（加密），无法直接拼接')
      }
      if (upper.startsWith('#EXT-X-MAP')) {
        const colon = line.indexOf(':')
        const attributes = colon >= 0 ? parseAttributeList(line.slice(colon + 1)) : {}
        const uri = attributes.URI
        if (!uri) throw new UnsupportedPlaylistError('#EXT-X-MAP 缺少 URI 属性')
        if (attributes.BYTERANGE) {
          throw new UnsupportedPlaylistError('#EXT-X-MAP 带 BYTERANGE，无法直接拼接')
        }
        initUri = resolveUri(uri, baseUrl)
        continue
      }
      if (upper.startsWith('#EXT-X-ENDLIST')) {
        isComplete = true
        continue
      }
      if (upper.startsWith('#EXTINF')) {
        const colon = line.indexOf(':')
        const value = colon >= 0 ? Number.parseFloat(line.slice(colon + 1)) : Number.NaN
        pendingDuration = Number.isFinite(value) && value > 0 ? value : undefined
        continue
      }
      // 其它标签（VERSION / TARGETDURATION / MEDIA-SEQUENCE / PLAYLIST-TYPE / 注释）不影响拼接
      continue
    }

    // 非 # 开头的行 = 媒体分片地址。带 BYTERANGE 的列表我们不支持：
    // 那种情况下同一地址会出现多次、各取一段，简单拼接会得到错误内容。
    if (pendingDuration === undefined) {
      throw new UnsupportedPlaylistError(`分片 ${line} 之前没有 #EXTINF，可能是按字节区间（BYTERANGE）的列表`)
    }
    segmentUris.push(resolveUri(line, baseUrl))
    durationSeconds += pendingDuration
    pendingDuration = undefined
  }

  if (segmentUris.length === 0) {
    throw new UnsupportedPlaylistError('播放列表里没有任何媒体分片')
  }

  return {
    ...(initUri ? { initUri } : {}),
    segmentUris,
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    isComplete,
  }
}
