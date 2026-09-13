/** 逐字/逐词时间戳：来自增强型 LRC 里的 [mm:ss.xx]word[mm:ss.xx]word 写法 */
export interface LyricWord {
  text: string
  /** 绝对时间（毫秒，与行时间同一坐标系） */
  atMs: number
}

export interface LyricLine {
  /** 行起始时间（毫秒），纯文本歌词为 0 */
  atMs: number
  text: string
  translation?: string
  /**
   * 这一行里每个词的开始时间（可选）。
   * 有它 → 逐字卡拉OK（按真实词时间点亮）；没有 → 整行高亮。
   */
  words?: LyricWord[]
}

/**
 * 歌词质量档，由高到低：
 * - `word`  逐字（增强型 LRC 带词级时间），可做卡拉OK
 * - `line`  整行（普通 LRC，只有行时间轴）
 * - `plain` 纯文本（没有时间轴）
 *
 * 同一个后端可能对一首歌返回多个版本，UI 一律按这个档位择优。
 */
export type LyricTier = 'word' | 'line' | 'plain'

/** 同一首歌的其他可用歌词版本（档位低于当前选中的那份） */
export interface LyricAlternate {
  /** 服务端歌词条目 id */
  id: string
  tier: LyricTier
  language?: string
  source?: string
}

export interface LyricSheet {
  /** 服务端歌词条目 id（飞牛是 lyricGUID）；写回偏移时必须带上 */
  id?: string
  /** true 表示带时间轴（LRC），false 表示纯文本 */
  synced: boolean
  lines: LyricLine[]
  /** 用户设置的时间偏移（毫秒），正值表示歌词提前 */
  offsetMs: number
  /** 这份歌词的质量档，决定它在多版本里排第几 */
  tier: LyricTier
  language?: string
  source?: string
  raw?: string
  /** 同一首歌的其他可用版本，供 UI 提供「切换歌词」 */
  alternates?: LyricAlternate[]
}

/**
 * 判定一份歌词属于哪个档位。
 *
 * 只看解析结果，不看后端的 `isLRC` 标记 —— 实测 `isLRC` 只表示「是否带时间轴」，
 * 不区分逐字与整行，判断逐字必须看有没有词级时间。
 */
export function lyricTier(sheet: Pick<LyricSheet, 'lines' | 'synced'>): LyricTier {
  if (sheet.lines.some((line) => (line.words?.length ?? 0) > 0)) return 'word'
  return sheet.synced ? 'line' : 'plain'
}

/** 档位排序用：数字越小越好 */
export const LYRIC_TIER_RANK: Record<LyricTier, number> = { word: 0, line: 1, plain: 2 }

export const LYRIC_TIER_LABEL: Record<LyricTier, string> = {
  word: '逐字',
  line: '整行',
  plain: '纯文本',
}
