import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

/**
 * 外部数据源配置（用户自填的国内自建服务）。
 *
 * 决定（2026-09-27）：App 不内置任何外部源,由用户填写自建实例地址。
 * 按功能分两项:
 *   - 歌词源:优先取逐字(网易云 yrc),LrcAPI 作行级兜底,飞牛是最底层 base。
 *   - 音乐信息源:专辑完整曲目 / 艺人作品(完整度),用网易云或 QQ。
 * apiKey/token 存 Keychain(与其它敏感项同路径)。
 */

export type LyricSourceType = 'none' | 'netease' | 'lrcapi'
export type MusicInfoSourceType = 'none' | 'netease' | 'qq'

export interface SourceConfig {
  baseUrl: string
  /** 可选鉴权 token(LrcAPI 的 --auth / 网易云实例的 cookie 等) */
  token?: string
}

export interface ExternalSourcesData {
  lyrics: { type: LyricSourceType } & SourceConfig
  musicInfo: { type: MusicInfoSourceType } & SourceConfig
}

const KEY_EXTERNAL_SOURCES = 'qj.store.external_sources.v1'

const EMPTY: ExternalSourcesData = {
  lyrics: { type: 'none', baseUrl: '', token: '' },
  musicInfo: { type: 'none', baseUrl: '', token: '' },
}

interface ExternalSourcesStore extends ExternalSourcesData {
  hydrated: boolean
  setLyrics: (patch: Partial<{ type: LyricSourceType } & SourceConfig>) => void
  setMusicInfo: (patch: Partial<{ type: MusicInfoSourceType } & SourceConfig>) => void
}

function persist(data: ExternalSourcesData): void {
  void SecureStore.setItemAsync(KEY_EXTERNAL_SOURCES, JSON.stringify(data)).catch(() => undefined)
}

/** 归一化地址:去尾部斜杠、去空白 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export const useExternalSourcesStore = create<ExternalSourcesStore>((set, get) => ({
  ...EMPTY,
  hydrated: false,
  setLyrics: (patch) => {
    const lyrics = { ...get().lyrics, ...patch }
    set({ lyrics })
    persist({ lyrics, musicInfo: get().musicInfo })
  },
  setMusicInfo: (patch) => {
    const musicInfo = { ...get().musicInfo, ...patch }
    set({ musicInfo })
    persist({ lyrics: get().lyrics, musicInfo })
  },
}))

// 模块加载即水合（与 local-favorites / taste-profile 同模式）
void (async () => {
  try {
    const raw = await SecureStore.getItemAsync(KEY_EXTERNAL_SOURCES)
    const parsed = raw ? (JSON.parse(raw) as Partial<ExternalSourcesData>) : {}
    useExternalSourcesStore.setState({
      hydrated: true,
      lyrics: { ...EMPTY.lyrics, ...parsed.lyrics },
      musicInfo: { ...EMPTY.musicInfo, ...parsed.musicInfo },
    })
  } catch {
    useExternalSourcesStore.setState({ hydrated: true })
  }
})()

/** 非 React 环境(歌词加载器)读当前歌词源配置 */
export function getLyricsSource(): { type: LyricSourceType } & SourceConfig {
  return useExternalSourcesStore.getState().lyrics
}
