import { useEffect } from 'react'
import { View, type DimensionValue, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { radius, spacing } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/**
 * 骨架占位基元：一块会「呼吸」的圆角矩形。
 *
 * 为什么是脉冲而不是流光（shimmer）：流光要跑一条渐变横扫，实现成本高、
 * 在低端机上更容易掉帧；脉冲（透明度 0.5↔1 往返）用 reanimated 在 UI 线程跑，
 * 便宜且够用。颜色走 `skeleton2` 令牌（深浅色各一份），和封面占位底一致。
 */
export function SkeletonBlock({
  width,
  height,
  borderRadius = radius.sm,
  style,
}: {
  width?: DimensionValue
  height: number
  borderRadius?: number
  style?: ViewStyle
}) {
  const colors = useThemeColors()
  const opacity = useSharedValue(0.5)

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 650 }), withTiming(0.5, { duration: 650 })),
      -1,
      false,
    )
    return () => cancelAnimation(opacity)
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius,
          backgroundColor: colors.skeleton2,
        },
        animatedStyle,
        style,
      ]}
    />
  )
}

/** 一行曲目的骨架：与 TrackRow 的封面(48)+两行文字布局对齐，避免加载完成时跳位 */
export function TrackRowSkeleton() {
  const styles = useStyles()
  return (
    <View style={styles.trackRow}>
      <SkeletonBlock width={48} height={48} borderRadius={radius.sm} />
      <View style={styles.trackMeta}>
        <SkeletonBlock width="62%" height={15} />
        <SkeletonBlock width="38%" height={12} />
      </View>
    </View>
  )
}

/** 一行「头像 + 单行文字」的骨架：艺术家列表用（圆形头像 52） */
export function AvatarRowSkeleton({ avatar = 52 }: { avatar?: number }) {
  const styles = useStyles()
  return (
    <View style={styles.trackRow}>
      <SkeletonBlock width={avatar} height={avatar} borderRadius={avatar / 2} />
      <View style={styles.trackMeta}>
        <SkeletonBlock width="48%" height={15} />
        <SkeletonBlock width="22%" height={12} />
      </View>
    </View>
  )
}

/** 一张封面卡的骨架：与专辑/艺术家网格的「方图 + 标题 + 副标题」对齐 */
export function CardSkeleton({ size, circle = false }: { size: number; circle?: boolean }) {
  const styles = useStyles()
  return (
    <View style={{ width: size }}>
      <SkeletonBlock width={size} height={size} borderRadius={circle ? size / 2 : radius.md} />
      <View style={styles.cardMeta}>
        <SkeletonBlock width="80%" height={13} />
        <SkeletonBlock width="50%" height={11} />
      </View>
    </View>
  )
}

/** 曲目列表首屏骨架：铺 N 行，几何与真实列表一致 */
export function TrackListSkeleton({ rows = 10 }: { rows?: number }) {
  const styles = useStyles()
  return (
    <View style={styles.listRoot} accessibilityLabel="加载中" accessibilityElementsHidden>
      {Array.from({ length: rows }).map((_, index) => (
        <TrackRowSkeleton key={index} />
      ))}
    </View>
  )
}

/** 头像行列表首屏骨架：艺术家页用 */
export function AvatarListSkeleton({ rows = 10, avatar = 52 }: { rows?: number; avatar?: number }) {
  const styles = useStyles()
  return (
    <View style={styles.listRoot} accessibilityLabel="加载中" accessibilityElementsHidden>
      {Array.from({ length: rows }).map((_, index) => (
        <AvatarRowSkeleton key={index} avatar={avatar} />
      ))}
    </View>
  )
}

/**
 * 封面网格首屏骨架（专辑 / 艺术家 / 流派 / 歌单）。
 * `columns` 与 `itemSize` 由调用方按屏宽算好传进来，与真实网格对齐；
 * `circle` 时封面为圆（艺术家页）。
 */
export function CardGridSkeleton({
  columns,
  itemSize,
  rows = 4,
  circle = false,
}: {
  columns: number
  itemSize: number
  rows?: number
  circle?: boolean
}) {
  const styles = useStyles()
  const count = columns * rows
  return (
    <View style={styles.gridRoot} accessibilityLabel="加载中" accessibilityElementsHidden>
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} size={itemSize} circle={circle} />
      ))}
    </View>
  )
}

/** 流派卡网格首屏骨架：宽矩形卡（与 GenreCard 的 96 高对齐） */
export function GenreGridSkeleton({
  columns,
  itemWidth,
  rows = 4,
  cardHeight = 96,
}: {
  columns: number
  itemWidth: number
  rows?: number
  cardHeight?: number
}) {
  const styles = useStyles()
  const count = columns * rows
  return (
    <View style={styles.gridRoot} accessibilityLabel="加载中" accessibilityElementsHidden>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} width={itemWidth} height={cardHeight} borderRadius={radius.lg} />
      ))}
    </View>
  )
}

const useStyles = createThemedStyles(() => ({
  listRoot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  gridRoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 4,
    minHeight: 56,
  },
  trackMeta: {
    flex: 1,
    gap: 8,
  },
  cardMeta: {
    marginTop: spacing.xs,
    gap: 6,
  },
}))
