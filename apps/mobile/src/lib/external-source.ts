import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

/**
 * 外部数据源配置（用户自填的国内自建服务）—— 按「服务」组织。
 *
 * 一个服务配一次（地址+token），用能力开关决定它供歌词还是信息：
 *   - 网易云：既能逐字歌词(yrc)又能完整度信息 → 一个实例通吃，不用填两遍地址；
 *   - LrcAPI：仅歌词（行级兜底）；
 *   - QQ：仅信息（待接）。
 * App 不内置任何源，仅访问用户填写的地址。token 存 Keychain。
 */

export type SourceType = 'netease' | 'lrcapi' | 'qq'

/** 各类型支持的能力 + 展示名 */
export const SOURCE_CAPS: Record<SourceType, { lyrics: boolean; musicInfo: boolean; label: string; hint: string }> = {
  netease: { lyrics: true, musicInfo: true, label: '网易云', hint: '逐字歌词 + 完整度信息' },
  lrcapi: { lyrics: true, musicInfo: false, label: 'LrcAPI', hint: '仅歌词（行级兜底）' },
  qq: { lyrics: false, musicInfo: true, label: 'QQ音乐', hint: '仅信息（暂未接入）' },
}

export interface SourceService {
  id: string
  type: SourceType
  baseUrl: string
  token?: string
  /** 用于逐字/行级歌词 */
  useLyrics: boolean
  /** 用于专辑完整曲目 / 艺人作品(完整度) */
  useMusicInfo: boolean
}

const KEY_EXTERNAL_SOURCES = 'qj.store.external_sources.v1'

/** 解析歌词/信息源时的类型优先级（越靠前越优先） */
const LYRICS_PRIORITY: SourceType[] = ['netease', 'lrcapi']
const INFO_PRIORITY: SourceType[] = ['netease', 'qq']

interface ExternalSourcesStore {
  hydrated: boolean
  services: SourceService[]
  addService: (type: SourceType) => void
  updateService: (id: string, patch: Partial<SourceService>) => void
  removeService: (id: string) => void
}

function persist(services: SourceService[]): void {
  void SecureStore.setItemAsync(KEY_EXTERNAL_SOURCES, JSON.stringify({ services })).catch(() => undefined)
}

/** 归一化地址：去尾部斜杠、去空白 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

let seq = 0
function newId(): string {
  seq += 1
  return `svc-${Date.now().toString(36)}-${seq}`
}

export const useExternalSourcesStore = create<ExternalSourcesStore>((set, get) => ({
  hydrated: false,
  services: [],
  addService: (type) => {
    const caps = SOURCE_CAPS[type]
    const service: SourceService = {
      id: newId(),
      type,
      baseUrl: '',
      token: '',
      useLyrics: caps.lyrics,
      useMusicInfo: caps.musicInfo,
    }
    const services = [...get().services, service]
    set({ services })
    persist(services)
  },
  updateService: (id, patch) => {
    const services = get().services.map((s) => (s.id === id ? { ...s, ...patch } : s))
    set({ services })
    persist(services)
  },
  removeService: (id) => {
    const services = get().services.filter((s) => s.id !== id)
    set({ services })
    persist(services)
  },
}))

// 模块加载即水合；兼容旧版 {lyrics,musicInfo} 结构，自动迁移成服务列表
void (async () => {
  try {
    const raw = await SecureStore.getItemAsync(KEY_EXTERNAL_SOURCES)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    let services: SourceService[] = Array.isArray(parsed.services) ? (parsed.services as SourceService[]) : []
    if (services.length === 0 && (parsed.lyrics || parsed.musicInfo)) {
      services = migrateLegacy(parsed as LegacyShape)
    }
    useExternalSourcesStore.setState({ hydrated: true, services })
  } catch {
    useExternalSourcesStore.setState({ hydrated: true })
  }
})()

interface LegacyShape {
  lyrics?: { type?: string; baseUrl?: string; token?: string }
  musicInfo?: { type?: string; baseUrl?: string; token?: string }
}

function migrateLegacy(legacy: LegacyShape): SourceService[] {
  const out: SourceService[] = []
  const l = legacy.lyrics
  const m = legacy.musicInfo
  // 旧版两项若同址同类型，合并成一个服务
  if (l?.type && l.type !== 'none' && l.baseUrl) {
    out.push({
      id: newId(),
      type: l.type as SourceType,
      baseUrl: l.baseUrl,
      token: l.token ?? '',
      useLyrics: true,
      useMusicInfo:
        Boolean(m?.type && m.type !== 'none' && m.baseUrl === l.baseUrl && m.type === l.type) &&
        SOURCE_CAPS[l.type as SourceType]?.musicInfo === true,
    })
  }
  if (m?.type && m.type !== 'none' && m.baseUrl && !(m.baseUrl === l?.baseUrl && m.type === l?.type)) {
    out.push({
      id: newId(),
      type: m.type as SourceType,
      baseUrl: m.baseUrl,
      token: m.token ?? '',
      useLyrics: false,
      useMusicInfo: true,
    })
  }
  return out
}

// ── 解析器：把服务列表解析成某项能力的当前源 ──────────────────────────────
export interface ResolvedSource {
  type: SourceType | 'none'
  baseUrl: string
  token?: string
}

function resolve(kind: 'lyrics' | 'musicInfo'): ResolvedSource {
  const services = useExternalSourcesStore.getState().services
  const priority = kind === 'lyrics' ? LYRICS_PRIORITY : INFO_PRIORITY
  const candidates = services.filter(
    (s) => (kind === 'lyrics' ? s.useLyrics : s.useMusicInfo) && normalizeBaseUrl(s.baseUrl).length > 0,
  )
  candidates.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))
  const chosen = candidates[0]
  if (!chosen) return { type: 'none', baseUrl: '' }
  return { type: chosen.type, baseUrl: chosen.baseUrl, token: chosen.token }
}

/** 非 React 环境读当前歌词源 */
export function getLyricsSource(): ResolvedSource {
  return resolve('lyrics')
}

/** 非 React 环境读当前音乐信息源 */
export function getMusicInfoSource(): ResolvedSource {
  return resolve('musicInfo')
}

export function hasMusicInfoSource(): boolean {
  return getMusicInfoSource().type !== 'none'
}
