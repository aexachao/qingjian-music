import { useEffect, useRef } from 'react'
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 通用分段控件（搜索结果、音乐人详情、收藏分类等页签均使用）。
 *
 * 采用与播放列表 (待播/历史) 一致的平滑滑动指示条：
 * - 贝塞尔曲线 Easing.bezier(0.25, 0.1, 0.25, 1) 平滑过渡
 * - 动态测量各 Tab 的 x 坐标与宽度，指示条单实例流畅位移
 * - 支持居中 (center) 与超长横向平滑跟滚 (scrollTo)
 */
export interface SegmentedTabItem<T extends string = string> {
  key: T
  label: string
}

export interface SegmentedTabsProps<T extends string = string> {
  items: readonly SegmentedTabItem<T>[]
  value: T
  onChange: (key: T) => void
  /** 无障碍：整条控件的名字，例如「搜索结果分类」 */
  accessibilityLabel?: string
  /** 是否居中显示页签（页签较少时居中对齐） */
  center?: boolean
}

export function SegmentedTabs<T extends string = string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  center,
}: SegmentedTabsProps<T>) {
  const styles = useStyles()
  const scrollViewRef = useRef<ScrollView>(null)
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({})
  const isInitialRef = useRef(true)

  const indicatorX = useSharedValue(0)
  const indicatorWidth = useSharedValue(0)
  const indicatorOpacity = useSharedValue(0)

  const onTabLayout = (key: T, layout: { x: number; width: number }) => {
    tabLayouts.current[key] = layout
    if (key === value && isInitialRef.current) {
      isInitialRef.current = false
      indicatorX.value = layout.x
      indicatorWidth.value = layout.width
      indicatorOpacity.value = 1
    }
  }

  useEffect(() => {
    const layout = tabLayouts.current[value]
    if (!layout) return
    const targetX = layout.x
    const targetWidth = layout.width

    if (!isInitialRef.current) {
      indicatorX.value = withTiming(targetX, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
      indicatorWidth.value = withTiming(targetWidth, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    } else {
      indicatorX.value = targetX
      indicatorWidth.value = targetWidth
    }
    indicatorOpacity.value = 1

    scrollViewRef.current?.scrollTo({
      x: Math.max(0, targetX - 32),
      animated: true,
    })
  }, [indicatorOpacity, indicatorWidth, indicatorX, value])

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
    opacity: indicatorOpacity.value,
  }))

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, center && styles.rowCenter]}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((item) => {
        const selected = item.key === value
        return (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => onChange(item.key)}
            onLayout={(e) => onTabLayout(item.key, e.nativeEvent.layout)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
            {/* 占位以维持间距与高度 */}
            <View style={styles.indicatorPlaceholder} />
          </Pressable>
        )
      })}
      {/* 平滑滑动的指示条（单实例流体过渡） */}
      <Animated.View style={[styles.slidingIndicator, indicatorAnimatedStyle]} pointerEvents="none" />
    </ScrollView>
  )
}

const useStyles = createThemedStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    position: 'relative',
  },
  rowCenter: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
  },
  label: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  indicatorPlaceholder: {
    height: 2,
  },
  slidingIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
  },
  // 让指示条在未选中时也占位，避免整行高度抖动
  hairline: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
}))
