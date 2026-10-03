import { type ImageSourcePropType, useColorScheme } from 'react-native'
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { getAppIcon, setAppIcon, type AppIconId } from '../../modules/app-icon'
import { StorageMutationQueue } from './storage-mutation-queue'
import { createHydrationQueue, createLatestAsyncIntentQueue } from './hydration-queue'

const KEY_APPEARANCE_PREFS = 'qj.prefs.appearance'

export type ThemeMode = 'system' | 'dark' | 'light'

export interface ThemeModeOption {
  value: ThemeMode
  label: string
  description: string
}

export const THEME_MODE_OPTIONS: readonly ThemeModeOption[] = [
  {
    value: 'system',
    label: '跟随系统',
    description: '自动根据系统设置切换浅色或深色外观',
  },
  {
    value: 'dark',
    label: '暗色',
    description: '始终使用深色外观',
  },
  {
    value: 'light',
    label: '亮色',
    description: '始终使用亮色外观',
  },
] as const

export interface AppLogoOption {
  id: AppIconId
  name: string
  description: string
  source: ImageSourcePropType
  isDefault?: boolean
}

/**
 * 官方精心设计的应用图标列表（保留多 Logo 切换架构，便于后续持续扩展）：
 * 默认使用「轻简音符」。
 *
 * 界面按一行 4 个的网格渲染，图标顺序即界面呈现顺序。
 */
export const APP_LOGOS: readonly AppLogoOption[] = [
  {
    id: 'crimson-note',
    name: '轻简音符',
    description: '经典绯红 · 灵动音符',
    source: require('../../assets/images/logos/logo-crimson-note.png'),
    isDefault: true,
  },
  {
    id: 'white-note',
    name: '纯白绯音',
    description: '纯白底色 · 绯红音符',
    source: require('../../assets/images/logos/logo-white-note.png'),
  },
  {
    id: 'dark-note',
    name: '暗夜流光',
    description: '深邃黑调 · 纯白音符',
    source: require('../../assets/images/logos/logo-dark-note.png'),
  },
  {
    id: 'dark-crimson',
    name: '黑曜赤弦',
    description: '深黑背景 · 灵动赤红',
    source: require('../../assets/images/logos/logo-dark-crimson.png'),
  },
] as const

export const DEFAULT_LOGO_ID = 'crimson-note'

export interface AppearancePreferencesData {
  themeMode: ThemeMode
  activeLogoId: string
}

interface AppearancePreferencesState extends AppearancePreferencesData {
  setThemeMode: (themeMode: ThemeMode) => void
  setActiveLogoId: (activeLogoId: AppIconId) => Promise<void>
}

function normalizeThemeMode(val: unknown): ThemeMode {
  if (val === 'dark' || val === 'light') return val
  return 'system'
}

function normalizeLogoId(val: unknown): AppIconId {
  if (typeof val === 'string' && APP_LOGOS.some((logo) => logo.id === val)) {
    return val as AppIconId
  }
  return DEFAULT_LOGO_ID
}

async function persist(state: AppearancePreferencesData) {
  try {
    await storageWrites.run(() =>
      SecureStore.setItemAsync(
        KEY_APPEARANCE_PREFS,
        JSON.stringify({
          themeMode: state.themeMode,
          activeLogoId: state.activeLogoId,
        }),
      ),
    )
  } catch {
    // 忽略写入异常
  }
}

const storageWrites = new StorageMutationQueue()
const hydration = createHydrationQueue<AppearancePreferencesData>()
const iconQueue = createLatestAsyncIntentQueue()
let latestIconIntent: AppIconId = DEFAULT_LOGO_ID
let hasIconIntent = false

function ensureHydrated(): void {
  let logoNeedsSync = false
  let retryAfterIntentChange = false
  void hydration.hydrate(async () => {
    const startIntent = iconQueue.current()
    const raw = await SecureStore.getItemAsync(KEY_APPEARANCE_PREFS)
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const nativeLogoId = normalizeLogoId(await getAppIcon())
    // Hydration itself must not invalidate pending icon changes.
    if (startIntent !== iconQueue.current()) {
      retryAfterIntentChange = true
      throw new Error('Appearance changed during hydration')
    }
    logoNeedsSync = data.activeLogoId !== nativeLogoId
    return {
      themeMode: data.themeMode ? normalizeThemeMode(data.themeMode) : 'system',
      activeLogoId: nativeLogoId,
    }
  }, (data, replayed) => {
    useAppearancePreferences.setState({ ...data })
    if (replayed || logoNeedsSync) {
      void persist(useAppearancePreferences.getState())
    }
  }).then((hydrated) => {
    if (!hydrated && retryAfterIntentChange) ensureHydrated()
  })
}

export const useAppearancePreferences = create<AppearancePreferencesState>((set, get) => ({
  themeMode: 'system',
  activeLogoId: DEFAULT_LOGO_ID,
  setThemeMode: (themeMode) => {
    hydration.queue((data) => ({ ...data, themeMode }))
    set({ themeMode })
    if (hydration.hydrated) void persist(get())
    else ensureHydrated()
  },
  setActiveLogoId: async (activeLogoId) => {
    const currentTarget = hasIconIntent ? latestIconIntent : get().activeLogoId
    if (activeLogoId === currentTarget) return
    const intent = iconQueue.begin()
    latestIconIntent = activeLogoId
    hasIconIntent = true
    ensureHydrated()

    const operation = iconQueue.run(intent, () => setAppIcon(activeLogoId)).then(async (latest) => {
      if (!latest) return
      set({ activeLogoId })
      hydration.queue((data) => ({ ...data, activeLogoId }))
      if (hydration.hydrated) await persist(get())
      else ensureHydrated()
    }).catch((error: unknown) => {
      if (iconQueue.isLatest(intent)) {
        hasIconIntent = false
        latestIconIntent = normalizeLogoId(get().activeLogoId)
      }
      throw error
    })
    return operation
  },
}))

// 初始化：异步从 SecureStore 恢复持久化数据
ensureHydrated()

/**
 * 获取当前经过系统设置与用户偏好计算后实际生效的主题模式：'dark' | 'light'
 */
export function useEffectiveTheme(): 'dark' | 'light' {
  const themeMode = useAppearancePreferences((s) => s.themeMode)
  const systemScheme = useColorScheme()

  if (themeMode === 'system') {
    return systemScheme === 'light' ? 'light' : 'dark'
  }
  return themeMode
}

/**
 * 全 App 统一的 Logo 获取 Hook，用户在设置中选择后即刻响应更新
 */
export function useAppLogo() {
  const activeLogoId = useAppearancePreferences((s) => s.activeLogoId)
  const setActiveLogoId = useAppearancePreferences((s) => s.setActiveLogoId)

  const activeLogo =
    APP_LOGOS.find((item) => item.id === activeLogoId) ??
    APP_LOGOS.find((item) => item.isDefault) ??
    APP_LOGOS[0]

  return {
    activeLogo,
    activeLogoId,
    setActiveLogoId,
    logos: APP_LOGOS,
  }
}
