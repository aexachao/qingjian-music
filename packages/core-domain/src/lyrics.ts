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

export interface LyricSheet {
  /** 服务端歌词条目 id（飞牛是 lyricGUID）；写回偏移时必须带上 */
  id?: string
  /** true 表示带时间轴（LRC），false 表示纯文本 */
  synced: boolean
  lines: LyricLine[]
  /** 用户设置的时间偏移（毫秒），正值表示歌词提前 */
  offsetMs: number
  language?: string
  source?: string
  raw?: string
}
