import type { ComponentProps } from 'react'
import { useMemo } from 'react'
import { DarkTheme, DefaultTheme, type Stack } from 'expo-router'
import { useThemeColors } from '@/theme/theme-provider'
import { getThemeColors, type ResolvedTheme, type ThemeColors } from '@/theme/tokens'

type ScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>

/** 导航栏、Tab 栏与场景底色随运行时主题切换。 */
export function getNavigationTheme(theme: ResolvedTheme) {
  const colors = getThemeColors(theme)
  const base = theme === 'dark' ? DarkTheme : DefaultTheme
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bgPrimary,
      card: colors.bgPrimary,
      text: colors.textPrimary,
      primary: colors.accent,
      border: colors.borderSubtle,
      notification: colors.accent,
    },
  }
}

export function getStackScreenOptions(colors: ThemeColors): ScreenOptions {
  return {
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { color: colors.textPrimary },
    // iOS 26 上 headerStyle 与 headerLargeTitle 同用会令标题消失；底色只走导航主题 colors.card。
    headerShadowVisible: false,
    headerBackTitle: '',
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.bgPrimary },
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
  }
}

export function useStackScreenOptions(): ScreenOptions {
  const colors = useThemeColors()
  return useMemo(() => getStackScreenOptions(colors), [colors])
}

/** 页签根页隐藏原生 Stack 导航栏，由页内可折叠标题承载。 */
export const tabRootOptions = {
  headerShown: false,
} satisfies ScreenOptions
