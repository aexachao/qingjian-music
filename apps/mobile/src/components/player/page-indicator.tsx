import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { colors, radius, spacing } from '@/theme/tokens'

const DOT = 7
const PILL_WIDTH = 20
const DURATION = 200

interface PageIndicatorProps {
  count: number
  /** 当前页，0 起 */
  index: number
  /** 点某一段直接跳页 */
  onSelect?: (index: number) => void
  labels?: string[]
}

/** 播放页导航栏中间的页码指示器：当前页是白色胶囊，其余是浅灰小圆点 */
export function PageIndicator({ count, index, onSelect, labels }: PageIndicatorProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect?.(i)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ selected: i === index }}
          accessibilityLabel={labels?.[i] ?? `第 ${i + 1} 页`}
        >
          <Dot active={i === index} />
        </Pressable>
      ))}
    </View>
  )
}

function Dot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? PILL_WIDTH : DOT)
  const opacity = useSharedValue(active ? 1 : 0.4)

  useEffect(() => {
    width.value = withTiming(active ? PILL_WIDTH : DOT, { duration: DURATION })
    opacity.value = withTiming(active ? 1 : 0.4, { duration: DURATION })
  }, [active, opacity, width])

  const style = useAnimatedStyle(() => ({ width: width.value, opacity: opacity.value }))

  return <Animated.View style={[styles.dot, style]} />
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  dot: { height: DOT, borderRadius: radius.pill, backgroundColor: colors.textPrimary },
})
