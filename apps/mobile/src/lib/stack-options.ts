import { createElement, useMemo, type ComponentProps } from 'react'
import { DarkTheme, DefaultTheme, type Stack } from 'expo-router'
import { StackBackButton } from '@/components/stack-back-button'
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
      primary: colors.stateSelected,
      border: colors.borderSubtle,
      notification: colors.stateSelected,
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
    headerLeft: (props) => (props.canGoBack ? createElement(StackBackButton) : null),
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

/** 详情页默认透明导航栏，避免进场推屏瞬间闪现不透明底色。 */
export const detailScreenOptions = {
  headerTransparent: true,
  title: '',
} satisfies ScreenOptions

