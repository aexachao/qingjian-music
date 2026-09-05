export interface LyricLine {
  /** 行起始时间（毫秒），纯文本歌词为 0 */
  atMs: number
  text: string
  translation?: string
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
