import { useEffect, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { tap } from '@/lib/haptics'
import { useAppTheme, useThemeColors } from '@/theme/theme-provider'
import { fonts, radius, spacing, typography } from '@/theme/tokens'

/**
 * 通用分段控件：
 * - 'segmented'（默认）：高拟真 iOS 原生分段控制器 (UISegmentedControl)，
 *   包含 9pt 外圆角容器、7pt 内滑块药丸微阴影、未选中项发丝竖线分隔，结合物理触感与平滑位移动效；
 * - 'underline'：经典下划线平滑滑动指示条，支持长列表横向平滑跟滚。
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
  /** 是否居中显示页签（仅在 underline 模式下生效） */
  center?: boolean
  /** 呈现形态：'segmented' (iOS 原生分段控制器形态) | 'underline' (下划线指示条形态) */
  variant?: 'segmented' | 'underline'
}

export function SegmentedTabs<T extends string = string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  center,
  variant = 'underline',
}: SegmentedTabsProps<T>) {
  const { mode } = useAppTheme()
  const styles = useStyles(mode)
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
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
      indicatorWidth.value = withTiming(targetWidth, {
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    } else {
      indicatorX.value = targetX
      indicatorWidth.value = targetWidth
    }
    indicatorOpacity.value = 1

    if (variant === 'underline') {
      scrollViewRef.current?.scrollTo({
        x: Math.max(0, targetX - 32),
        animated: true,
      })
    }
  }, [indicatorOpacity, indicatorWidth, indicatorX, value, variant])

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
    opacity: indicatorOpacity.value,
  }))

  if (variant === 'segmented') {
    return (
      <View
        style={styles.segmentedContainer}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
      >
        {/* iOS 原生分段滑块（跟随选择流畅滑动） */}
        <Animated.View
          style={[styles.slidingIndicator, styles.segmentedThumb, indicatorAnimatedStyle]}
          pointerEvents="none"
        />
        {items.map((item, index) => {
          const selected = item.key === value
          const showDivider =
            index < items.length - 1 &&
            item.key !== value &&
            items[index + 1]?.key !== value

          return (
            <Pressable
              key={item.key}
              style={styles.segmentedItem}
              onPress={() => {
                tap()
                onChange(item.key)
              }}
              onLayout={(e) => onTabLayout(item.key, e.nativeEvent.layout)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
            >
              <Text
                style={[
                  styles.segmentedLabel,
                  selected && styles.segmentedLabelSelected,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {showDivider ? (
                <View style={styles.segmentedDivider} pointerEvents="none" />
              ) : null}
            </Pressable>
          )
        })}
      </View>
    )
  }

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
            onPress={() => {
              tap()
              onChange(item.key)
            }}
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
      <Animated.View style={[styles.slidingIndicator, styles.underlineIndicator, indicatorAnimatedStyle]} pointerEvents="none" />
    </ScrollView>
  )
}

function useStyles(mode: 'dark' | 'light') {
  const colors = useThemeColors()
  return useMemo(
    () =>
      StyleSheet.create({
        // --- iOS 原生分段组件 (UISegmentedControl) 样式 ---
        segmentedContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          height: 36,
          padding: 2,
          borderRadius: 9,
          backgroundColor: mode === 'dark' ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.12)',
          position: 'relative',
          width: '100%',
        },
        segmentedThumb: {
          position: 'absolute',
          top: 2,
          bottom: 2,
          borderRadius: 7,
          backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.22)' : '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1.5 },
          shadowOpacity: mode === 'dark' ? 0.32 : 0.14,
          shadowRadius: 2.5,
          elevation: 2,
        },
        segmentedItem: {
          flex: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
        },
        segmentedLabel: {
          fontSize: 13,
          lineHeight: 18,
          fontFamily: fonts.medium,
          fontWeight: '500',
          color: colors.textSecondary,
          textAlign: 'center',
        },
        segmentedLabelSelected: {
          fontFamily: fonts.semibold,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        segmentedDivider: {
          position: 'absolute',
          right: 0,
          top: 7,
          bottom: 7,
          width: StyleSheet.hairlineWidth || 1,
          backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
          borderRadius: 0.5,
        },

        // --- 原下划线形态样式 ---
        slidingIndicator: {
          position: 'absolute',
          left: 0,
        },
        underlineIndicator: {
          bottom: 0,
          height: 2,
          borderRadius: radius.pill,
          backgroundColor: colors.textPrimary,
        },
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
        hairline: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderSubtle,
        },
      }),
    [colors, mode],
  )
}
