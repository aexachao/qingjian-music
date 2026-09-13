/**
 * 后端能力声明。UI 一律按能力开关渲染入口，
 * 这样接入 Emby / Subsonic 时飞牛特有的功能（漫游、歌词偏移回写）会自动隐藏。
 */
export interface Capabilities {
  favorites: boolean
  playlists: 'none' | 'read' | 'write'
  playHistory: boolean
  lyrics: 'none' | 'plain' | 'synced'
  /** 是否支持把歌词时间偏移写回服务端 */
  lyricOffsetWriteback: boolean
  /** 个人电台（飞牛叫「漫游」） */
  radio: boolean
  /** 服务端转码（需要会话保活的那种） */
  transcode: boolean
  /** 聚合搜索联想 */
  searchSuggest: boolean
  genres: boolean
  ratings: boolean
  /** 多媒体库（共享库）概念 */
  multiLibrary: boolean
  /** 是否支持获取音频技术规格（codec、码率、采样率等） */
  audioSpec: boolean
  /**
   * 后端能否**真正按码率档位输出**（即「标准音质 / 省流量」是否有意义）。
   *
   * 为 false 表示服务端只有一档输出：此时选择「标准音质」既省不了流量，
   * 又会因为走转码链路而降低播放成功率 —— 所以 UI 不该提供这个选项，
   * 播放侧也必须恒按 original 处理，不得据此强制转码。
   * 已知：飞牛为 false（转码恒输出无损 FLAC，服务端忽略 bitrate，见 docs/fnos-transcode.md）。
   */
  qualityTiers: boolean
}

export const NO_CAPABILITIES: Capabilities = {
  favorites: false,
  playlists: 'none',
  playHistory: false,
  lyrics: 'none',
  lyricOffsetWriteback: false,
  radio: false,
  transcode: false,
  searchSuggest: false,
  genres: false,
  ratings: false,
  multiLibrary: false,
  audioSpec: false,
  qualityTiers: false,
}
