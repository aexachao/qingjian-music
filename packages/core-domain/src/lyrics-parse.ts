import type { LyricLine } from './lyrics'

/**
 * 外部歌词源（网易云 yrc / 标准 LRC）解析 —— 纯逻辑、可单测。
 *
 * - `parseYrc`：网易云**逐字** yrc → 带 `words[]` 的行（可做卡拉OK）。
 * - `parseLrc`：标准**行级** LRC → 只有行时间轴的行。
 * App 的 lyric-view 已能消费 `LyricLine.words`，有逐字就逐字点亮、没有就整行高亮。
 */

/**
 * 解析网易云 yrc（逐字）。
 *
 * 行格式：`[lineStartMs,lineDurationMs](wStartMs,wDurMs,0)字(wStartMs,wDurMs,0)字…`
 * 顶部可能有 JSON 元数据行（`{"t":0,"c":[...]}`），跳过。
 */
export function parseYrc(yrc: string): LyricLine[] {
  if (!yrc) return []
  const lines: LyricLine[] = []
  const wordRe = /\((\d+),(\d+),\d+\)([^(]*)/g

  for (const raw of yrc.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('{')) continue
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

  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
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
    if (stamps.length === 0) continue // 跳过无时间戳的元数据行（[ar:]/[ti:] 等已被上面的数字正则排除）
    const text = line.slice(lastEnd).trim()
    if (!text) continue
    for (const atMs of stamps) out.push({ atMs, text })
  }
  return out.sort((a, b) => a.atMs - b.atMs)
}
