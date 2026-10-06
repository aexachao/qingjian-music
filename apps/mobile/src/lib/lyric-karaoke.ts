import type { LyricLine } from '@qj/core-domain'

/** 没有下一行时，假设当前行唱这么久（逐词进度的兜底） */
export const FALLBACK_LINE_MS = 4000
/** 长按多久进入歌词分享 */
export const LONG_PRESS_MS = 320
export const LYRIC_MOTION = { focusMs: 180, wordMs: 100, readIdleMs: 6000, restingScale: 0.96 } as const

/** 找到当前该高亮的行：最后一个开始时间 <= 当前时间的行 */
export function activeIndexOf(lines: LyricLine[], atMs: number): number {
  let index = -1
  for (let i = 0; i < lines.length; i += 1) {
    const lineAtMs = lines[i]?.atMs ?? 0
    if (lineAtMs < 0) continue // 标题/歌手等元数据没有演唱时间，不参与高亮
    if (lineAtMs <= atMs) index = i
    else break
  }
  return index
}

/**
 * 这一行是不是卡拉OK行：文件里给了一行内的逐词时间（增强型 LRC）才算，
 * 用「下一个词的开始时间」而不是平均拍脑袋，才能跟得上人声。
 */
export function isKaraokeLine(line: LyricLine): boolean {
  return Array.isArray(line.words) && line.words.length >= 2
}

/**
 * 当前唱到第几个字。逐词推进：
 * 每个词里的字均分「这个词到下一个词」的时间，唱到哪个字的开始时间就亮到哪。
 */
export function litProgressChars(line: LyricLine, atMs: number, nextLineAtMs: number): number {
  const words = line.words ?? []
  if (words.length === 0) return 0
  let progress = 0
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!
    const wordChars = Array.from(word.text)
    const spanStart = word.atMs
    const spanEnd = words[i + 1]?.atMs ?? nextLineAtMs
    const span = Math.max(spanEnd - spanStart, 1)
    for (let c = 0; c < wordChars.length; c += 1) {
      const charStart = spanStart + (span * c) / wordChars.length
      const charEnd = spanStart + (span * (c + 1)) / wordChars.length
      if (atMs >= charEnd) progress += 1
      else if (atMs > charStart) progress += (atMs - charStart) / Math.max(charEnd - charStart, 1)
    }
  }
  return progress
}
