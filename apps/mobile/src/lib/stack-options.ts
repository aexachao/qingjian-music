import type { ComponentProps } from 'react'
import { DarkTheme, type Stack } from 'expo-router'
import { colors } from '@/theme/tokens'

type ScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>

/**
 * 导航主题：导航栏、Tab 栏、场景底色都从这里来。
 *
 * 为什么不用 headerStyle 直接刷底色：iOS 26 上给导航栏设了
 * headerStyle.backgroundColor 之后，大标题（headerLargeTitle）就不显示了
 * ——实测 react-native-screens 4.26 + iOS 26.5，标题区域留着高度但字没了。
 * 走主题的 colors.card 没这个问题，而且一处生效，所有 Stack / Tabs 都不用再单独刷底色。
 */
export const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bgPrimary,
    card: colors.bgPrimary,
    text: colors.textPrimary,
    primary: colors.accent,
    border: colors.borderSubtle,
    notification: colors.accent,
  },
}

/**
 * 所有 Stack 共用的导航栏样式：全 App 只有这一份，二级页面的返回按钮、
 * 标题颜色、返回手势都从这里来，避免各层 Stack 各写一套。
 */
export const stackScreenOptions = {
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { color: colors.textPrimary },
  // 导航栏不要那条分隔线：内容和导航栏同底色，划线只会显得脏
  headerShadowVisible: false,
  headerBackTitle: '返回',
  contentStyle: { backgroundColor: colors.bgPrimary },
  // 返回手势：edge 手势 + 整屏拖拽都开着（后者是 iOS 新默认，这里显式写出来防回退）
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
} satisfies ScreenOptions

/**
 * 页签根页专用：iOS 大标题（左对齐、滚动后收起成小标题）。
 * 用它的屏必须把滚动容器设成 contentInsetAdjustmentBehavior="automatic"，
 * 否则大标题不会跟着滚动收起。
 */
export const tabRootOptions = {
  headerLargeTitle: true,
  headerLargeTitleShadowVisible: false,
  headerLargeTitleStyle: { color: colors.textPrimary },
} satisfies ScreenOptions
