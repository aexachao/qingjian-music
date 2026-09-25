import { StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { spacing } from '@/theme/tokens'

export interface DetailPinnedToolbarProps {
  top: number
  children: React.ReactNode
}

/**
 * 详情页滚动吸顶工具栏底板 (DetailPinnedToolbar):
 * - 与顶部自适应毛玻璃导航栏使用完全同款的高斯模糊 (BlurView) 与浮层底色 (bgFloatingBlur 0.7)；
 * - 页面上滑越过头部吸顶后，与导航栏融为一体，彻底解决原底色与导航栏不统一的问题；
 * - 仅在最下沿设置发丝分割线，维持界面通透与层级一致。
 */
export function DetailPinnedToolbar({ top, children }: DetailPinnedToolbarProps) {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()

  return (
    <View style={[styles.pinnedBar, { top }]}>
      <BlurView
        tint={mode === 'dark' ? 'dark' : 'light'}
        intensity={100}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgFloatingBlur, opacity: 0.7 }]} />
      <View style={styles.content}>
        {children}
      </View>
      <View style={[styles.bottomBorder, { backgroundColor: colors.borderSubtle }]} />
    </View>
  )
}

const useStyles = createThemedStyles((_colors) => ({
  pinnedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  content: {
    width: '100%',
  },
  bottomBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
}))
