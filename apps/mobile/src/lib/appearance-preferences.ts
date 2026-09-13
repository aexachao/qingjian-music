import { type ImageSourcePropType, useColorScheme } from 'react-native'
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { getAppIcon, setAppIcon, type AppIconId } from '../../modules/app-icon'

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
    description: '始终保持深色视觉，沉浸且护眼',
  },
  {
    value: 'light',
    label: '亮色',
    description: '始终保持明亮清爽的视觉风格',
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
 * 4 款官方精心设计的应用图标：
 * 默认选中第 2 款「经典绯红」（即用户指定的主视觉 Logo）。
 */
export const APP_LOGOS: readonly AppLogoOption[] = [
  {
    id: 'dark-bars',
    name: '暗夜声律',
    description: '深邃暗调 · 律动声谱',
    source: require('../../assets/images/logos/logo-dark-bars.png'),
  },
  {
    id: 'crimson-glass',
    name: '经典绯红',
    description: '珊瑚绯红 · 晶莹音符',
    source: require('../../assets/images/logos/logo-crimson-glass.png'),
    isDefault: true,
  },
  {
    id: 'gold-glow',
    name: '流光金弦',
    description: '黑金流光 · 温暖透亮',
    source: require('../../assets/images/logos/logo-gold-glow.png'),
  },
  {
    id: 'crimson-bars',
    name: '绯红声谱',
    description: '品牌绯红 · 动感声浪',
    source: require('../../assets/images/logos/logo-crimson-bars.png'),
  },
] as const

export const DEFAULT_LOGO_ID = 'crimson-glass'

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
    await SecureStore.setItemAsync(
      KEY_APPEARANCE_PREFS,
      JSON.stringify({
        themeMode: state.themeMode,
        activeLogoId: state.activeLogoId,
      }),
    )
  } catch {
    // 忽略写入异常
  }
}

export const useAppearancePreferences = create<AppearancePreferencesState>((set, get) => ({
  themeMode: 'system',
  activeLogoId: DEFAULT_LOGO_ID,
  setThemeMode: (themeMode) => {
    set({ themeMode })
    void persist(get())
  },
  setActiveLogoId: async (activeLogoId) => {
    const previousLogoId = get().activeLogoId
    if (activeLogoId === previousLogoId) return

    try {
      await setAppIcon(activeLogoId)
      set({ activeLogoId })
      await persist(get())
    } catch (error) {
      set({ activeLogoId: previousLogoId })
      throw error
    }
  },
}))

// 初始化：异步从 SecureStore 恢复持久化数据
void (async () => {
  try {
    const raw = await SecureStore.getItemAsync(KEY_APPEARANCE_PREFS)
    if (raw) {
      const data = JSON.parse(raw) as Record<string, unknown>
      const nativeLogoId = normalizeLogoId(await getAppIcon())
      useAppearancePreferences.setState({
        ...(data.themeMode ? { themeMode: normalizeThemeMode(data.themeMode) } : {}),
        activeLogoId: nativeLogoId,
      })
      if (data.activeLogoId !== nativeLogoId) {
        await persist(useAppearancePreferences.getState())
      }
    } else {
      useAppearancePreferences.setState({ activeLogoId: normalizeLogoId(await getAppIcon()) })
    }
  } catch {
    // 忽略异常
  }
})()

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
