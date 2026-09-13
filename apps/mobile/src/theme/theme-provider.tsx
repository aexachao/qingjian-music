import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react'
import { Appearance, StyleSheet } from 'react-native'
import { getThemeColors, type ResolvedTheme, type ThemeColors } from '@/theme/tokens'

interface AppThemeContextValue {
  mode: ResolvedTheme
  isDark: boolean
  colors: ThemeColors
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

export function AppThemeProvider({
  mode,
  followsSystem = false,
  children,
}: PropsWithChildren<{ mode: ResolvedTheme; followsSystem?: boolean }>) {
  useEffect(() => {
    Appearance.setColorScheme(followsSystem ? 'unspecified' : mode)
    return () => Appearance.setColorScheme('unspecified')
  }, [followsSystem, mode])

  const value = useMemo<AppThemeContextValue>(
    () => ({ mode, isDark: mode === 'dark', colors: getThemeColors(mode) }),
    [mode],
  )

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext)
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider')
  return value
}

export function useThemeColors(): ThemeColors {
  return useAppTheme().colors
}

/** 创建会随运行时主题重新注册的 RN StyleSheet。 */
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ThemeColors) => T,
): () => T {
  return function useThemedStyles() {
    const colors = useThemeColors()
    return useMemo(() => StyleSheet.create(factory(colors)), [colors])
  }
}
