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
}
