import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { View } from 'react-native'
import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing } from '@/theme/tokens'

/**
 * 搜索框外壳：**只有浅色底、没有描边**，两种状态（浏览态的假框 / 输入态的真框）共用。
 *
 * 抽出来是为了钉住「两种状态长得一样」这件事 —— 之前各写一套样式，结果高度一个 44 一个 36、
 * 一个有描边一个没有（2026-09-15 验收时被抓出来）。尺寸只在这里定义。
 */
export const SEARCH_FIELD_HEIGHT = 40

export interface SearchFieldShellProps {
  children: ReactNode
  /** 外面要撑开时（例如输入态里占满顶栏剩余宽度）传进来 */
  style?: StyleProp<ViewStyle>
}

export function SearchFieldShell({ children, style }: SearchFieldShellProps) {
  const styles = useStyles()
  return <View style={[styles.shell, style]}>{children}</View>
}

const useStyles = createThemedStyles((colors) => ({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: SEARCH_FIELD_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    // 浅色底、无描边（设计定的）；用 bgButtonSecondary 而不是 bgInput：
    // bgInput 在深色下几乎透明，看起来不像「一个框」
    backgroundColor: colors.bgButtonSecondary,
  },
}))
