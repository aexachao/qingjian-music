import { memo, type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'

interface CollapsibleHeaderBarProps {
  title: string
  scrollY: SharedValue<number>
  rightElement?: ReactNode
}

interface LargeTitleHeaderProps {
  title: string
  rightElement?: ReactNode
  scrollY?: SharedValue<number>
  paddingHorizontal?: number
}

/**
 * 粘性顶部导航栏：
 * 处于屏幕最顶层（zIndex: 50），未滚动时完全透明穿透；
 * 向上滚动时，毛玻璃背景与小标题平滑浮现，完整遮盖下方上滑的内容与大标题，对齐 Apple Music 质感。
 */
export const CollapsibleHeaderBar = memo(function CollapsibleHeaderBar({
  title,
  scrollY,
  rightElement,
}: CollapsibleHeaderBarProps) {
  const { mode } = useAppTheme()
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const topInset = Math.max(insets.top, 20)
  const barHeight = topInset + 44

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [10, 48], [0, 1], 'clamp'),
  }))

  const animatedTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [20, 52], [0, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(scrollY.value, [20, 52], [6, 0], 'clamp'),
      },
    ],
  }))

  return (
    <View style={[styles.barContainer, { height: barHeight }]} pointerEvents="box-none">
      {/* 滚动浮现的背景：iOS 毛玻璃 + 深色蒙层，Android 实色底 */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]} pointerEvents="none">
        {Platform.OS === 'ios' ? (
          <>
            <BlurView tint={mode === 'dark' ? 'dark' : 'light'} intensity={100} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.bgOverlay]} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
        )}
      </Animated.View>

      {/* 导航栏内容区（高度 44pt，贴合状态栏下方） */}
      <View style={[styles.barContent, { marginTop: topInset }]}>
        <View style={styles.sideSlot} />
        <Animated.Text style={[styles.navTitle, animatedTitleStyle]} numberOfLines={1}>
          {title}
        </Animated.Text>
        <View style={styles.sideSlot}>{rightElement ?? null}</View>
      </View>
    </View>
  )
})

/**
 * 原生展开大标题：
 * 渲染在 ScrollView 内容的最顶部，紧贴状态栏下方，彻底消除原生 UINavigationBar 44pt 空白死区。
 */
export const LargeTitleHeader = memo(function LargeTitleHeader({
  title,
  rightElement,
  scrollY,
  paddingHorizontal = 0,
}: LargeTitleHeaderProps) {
  const styles = useStyles()
  const insets = useSafeAreaInsets()
  const topInset = Math.max(insets.top, 20)

  const animatedTitleStyle = useAnimatedStyle(() => {
    if (!scrollY) return {}
    return {
      opacity: interpolate(scrollY.value, [25, 65], [1, 0], 'clamp'),
    }
  })

  return (
    <View style={[styles.largeTitleContainer, { paddingTop: topInset + 8, paddingHorizontal }]}>
      <Animated.Text style={[styles.largeTitle, animatedTitleStyle]}>{title}</Animated.Text>
      {rightElement ? <View>{rightElement}</View> : null}
    </View>
  )
})

const useStyles = createThemedStyles((colors) => ({
  barContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  barContent: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.pageMargin,
  },
  sideSlot: {
    width: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  navTitle: {
    ...typography.headline,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  bgOverlay: {
    backgroundColor: colors.bgPrimary,
    opacity: 0.75,
  },
  androidBg: {
    backgroundColor: colors.bgPrimary,
  },
  largeTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.37,
  },
}))
