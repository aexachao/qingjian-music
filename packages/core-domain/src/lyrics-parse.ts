import type { LyricLine } from './lyrics'

/**
 * 外部歌词源（网易云 yrc / 标准 LRC）解析 —— 纯逻辑、可单测。
 *
 * - `parseYrc`：网易云**逐字** yrc → 带 `words[]` 的行（可做卡拉OK）。
 * - `parseLrc`：标准**行级** LRC → 只有行时间轴的行。
 * App 的 lyric-view 已能消费 `LyricLine.words`，有逐字就逐字点亮、没有就整行高亮。
 */

export interface LyricMetadata {
  text: string
  /** JSON credit records may carry a real playback position in milliseconds. */
  atMs?: number
}

/** 署名/曲目信息；by 是歌词文件制作者，不能当成作词。 */
export function parseLyricMetadata(line: string): LyricMetadata | null {
  if (line.startsWith('{')) {
    try {
      const data: unknown = JSON.parse(line)
      if (!data || typeof data !== 'object' || !('c' in data) || !Array.isArray(data.c)) return null
      const text = data.c.map((part: unknown) =>
        part && typeof part === 'object' && 'tx' in part && typeof part.tx === 'string' ? part.tx : '',
      ).join('').trim()
      if (!text) return null
      const timestamp = 't' in data && typeof data.t === 'number' && Number.isFinite(data.t) && data.t >= 0
        ? data.t
        : undefined
      return { text, ...(timestamp === undefined ? {} : { atMs: timestamp }) }
    } catch {
      return null
    }
  }
  const match = /^\[([^:\]]+):(.*)\]$/.exec(line)
  if (!match) return null
  const labels: Record<string, string> = {
    ti: '歌曲', ar: '歌手', al: '专辑',
    au: '作词', author: '作词', lyricist: '作词', 作词: '作词',
    composer: '作曲', 作曲: '作曲', singer: '演唱', 演唱: '演唱',
    arranger: '编曲', 编曲: '编曲',
  }
  const label = labels[match[1]!.trim().toLowerCase()]
  const value = match[2]!.trim()
  return label && value ? { text: `${label}：${value}` } : null
}

/** Compatibility helper retained for provider consumers that only need display text. */
export function extractLyricMetadata(line: string): string | null {
  return parseLyricMetadata(line)?.text ?? null
}

/**
 * 解析网易云 yrc（逐字）。
 *
 * 行格式：`[lineStartMs,lineDurationMs](wStartMs,wDurMs,0)字(wStartMs,wDurMs,0)字…`
 * JSON 署名行保留；有效的非负 t 字段作为播放时间，缺失或无效时保持无时间。
 */
export function parseYrc(yrc: string): LyricLine[] {
  if (!yrc) return []
  const lines: LyricLine[] = []
  const wordRe = /\((\d+),(\d+),\d+\)([^(]*)/g

  let metaIndex = -99999
  for (const raw of yrc.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const meta = parseLyricMetadata(line)
    if (meta) {
      const atMs = meta.atMs ?? metaIndex++
      lines.push({ atMs, text: meta.text })
      continue
    }

    const header = /^\[(\d+),(\d+)\]/.exec(line)
    if (!header) continue
    const lineStart = Number.parseInt(header[1]!, 10)
    const rest = line.slice(header[0].length)

    const words: { text: string; atMs: number }[] = []
    let m: RegExpExecArray | null
    wordRe.lastIndex = 0
    while ((m = wordRe.exec(rest)) !== null) {
      const atMs = Number.parseInt(m[1]!, 10)
      const text = m[3] ?? ''
      words.push({ text, atMs })
    }

    const text = words.map((w) => w.text).join('').trim()
    if (!text) continue
    // 只保留有实际字符的词（纯空白词不点亮，但保留在 text 里的空格由上面 join 处理）
    const meaningful = words.filter((w) => w.text.length > 0)
    lines.push({
      atMs: Number.isFinite(lineStart) ? lineStart : 0,
      text,
      ...(meaningful.length >= 2 ? { words: meaningful } : {}),
    })
  }
  return lines.sort((a, b) => a.atMs - b.atMs)
}

/**
 * 解析标准 LRC（行级）。支持一行多个时间戳（`[t1][t2]词`）。
 * 时间戳形如 `[mm:ss.xx]` / `[mm:ss.xxx]` / `[mm:ss]`。
 */
export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return []
  const out: LyricLine[] = []
  const tagRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

  let metaIndex = -99999
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const meta = parseLyricMetadata(line)
    if (meta) {
      const atMs = meta.atMs ?? metaIndex++
      out.push({ atMs, text: meta.text })
      continue
    }

    const stamps: number[] = []
    let m: RegExpExecArray | null
    tagRe.lastIndex = 0
    let lastEnd = 0
    while ((m = tagRe.exec(line)) !== null) {
      const min = Number.parseInt(m[1]!, 10)
      const sec = Number.parseInt(m[2]!, 10)
      const frac = m[3] ? Number.parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0
      stamps.push(min * 60_000 + sec * 1000 + frac)
      lastEnd = tagRe.lastIndex
    }
    if (stamps.length === 0) continue // 跳过无时间戳的其他元数据行
    const text = line.slice(lastEnd).trim()
    if (!text) continue
    for (const atMs of stamps) out.push({ atMs, text })
  }
  return out.sort((a, b) => a.atMs - b.atMs)
}
