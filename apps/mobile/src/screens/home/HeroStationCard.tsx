import { useCallback, useEffect, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, AppState, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import Animated, {
  cancelAnimation, Easing, type SharedValue, useAnimatedReaction,
  useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated'
import { useIsFocused } from 'expo-router'
import { useIsPlaying } from 'react-native-track-player'
import { TurntableIllustration } from './TurntableIllustration'
import { selectCurrent, usePlayerStore } from '@/player/store'
import { tap } from '@/lib/haptics'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export const HERO_STATION_CARD_HEIGHT = 124

interface HeroStationCardProps {
  onStartRadio: () => void
  isRoaming: boolean
  startingRadio?: boolean
  disabled?: boolean
  isInteracting?: () => boolean
  scrollY: SharedValue<number>
  /** 卡片在滚动内容中的纵坐标，用于离屏停转。 */
  contentTop: SharedValue<number>
}

/** 漫游模式入口；曲目与播放控制只属于迷你播放器。 */
export function HeroStationCard({
  onStartRadio, isRoaming, startingRadio = false,
  disabled = false, isInteracting, scrollY, contentTop,
}: HeroStationCardProps) {
  const { colors, isDark } = useAppTheme()
  const styles = useStyles()
  const { playing } = useIsPlaying()
  const current = usePlayerStore(selectCurrent)
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  // 默认静止，取得系统设置后再开始，避免减少动态用户看到一闪而过的旋转。
  const [reduceMotion, setReduceMotion] = useState(true)
  useEffect(() => {
    let mounted = true
    let receivedChange = false
    const app = AppState.addEventListener('change', (state) => setForeground(state === 'active'))
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      receivedChange = true
      setReduceMotion(enabled)
    })
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !receivedChange) setReduceMotion(enabled)
    }).catch(() => {})
    return () => { mounted = false; app.remove(); motion.remove() }
  }, [])

  const angle = useSharedValue(0)
  const drift = useSharedValue(0)
  const ambience = useSharedValue(isRoaming ? playing ? 1 : 0.2 : 0.09)
  useEffect(() => {
    ambience.value = withTiming(isRoaming ? playing ? 1 : 0.2 : 0.09, { duration: reduceMotion ? 0 : 500 })
    return () => cancelAnimation(ambience)
  }, [ambience, isRoaming, playing, reduceMotion])
  const edgeStyle = useAnimatedStyle(() => ({ opacity: isDark ? 0.18 + ambience.value * 0.62 : 0.42 + ambience.value * 0.28 }))
  const height = useSharedValue(HERO_STATION_CARD_HEIGHT)
  const width = useSharedValue(196)
  const shouldAnimate = Boolean(isRoaming && playing && focused && foreground && !reduceMotion && !startingRadio)
  useAnimatedReaction(
    () => shouldAnimate && scrollY.value < contentTop.value + height.value,
    (active, previous) => {
      if (active === previous) return
      cancelAnimation(angle)
      cancelAnimation(drift)
      if (active) {
        // 保留暂停角度；每圈恰好 360°，重复边界没有视觉跳变。
        angle.value = angle.value % 360
        angle.value = withRepeat(withTiming(angle.value + 360, {
          duration: 9000, easing: Easing.linear,
        }), -1, false)
        drift.value = drift.value % 1
        drift.value = withRepeat(withTiming(drift.value + 1, { duration: 32000, easing: Easing.linear }), -1, false)
      }
    },
    [shouldAnimate],
  )
  useEffect(() => () => { cancelAnimation(angle); cancelAnimation(drift) }, [angle, drift])


  const [compact, setCompact] = useState(false)
  const blocked = startingRadio || disabled
  const handlePress = useCallback(() => {
    if (blocked || isRoaming || isInteracting?.()) return
    tap()
    onStartRadio()
  }, [blocked, isRoaming, isInteracting, onStartRadio])

  const onLayout = (event: LayoutChangeEvent) => {
    height.value = event.nativeEvent.layout.height
    width.value = event.nativeEvent.layout.width
    setCompact(event.nativeEvent.layout.width < 170)
  }
  const content = (
    <>
      <AmbientGlow clock={drift} intensity={ambience} cardWidth={width} cardHeight={height}
        color={colors.roamingAmbient} size={[236, 166]} speed={1} offset={0} strength={0.29} id="rose" />
      <AmbientGlow clock={drift} intensity={ambience} cardWidth={width} cardHeight={height}
        color={colors.roamingAmbientApricot} size={[204, 144]} speed={-1} offset={2.1} strength={0.23} id="apricot" />
      <AmbientGlow clock={drift} intensity={ambience} cardWidth={width} cardHeight={height}
        color={colors.roamingAmbientLavender} size={[180, 150]} speed={2} offset={4.2} strength={0.27} id="lavender" />
      <Animated.View style={[styles.edgeLight, edgeStyle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%">
          <Defs><LinearGradient id="roamingEdgeLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor={colors.roamingEdge} stopOpacity={0.55} />
            <Stop offset="0.14" stopColor={colors.roamingEdge} stopOpacity={0.2} />
            <Stop offset="0.32" stopColor={colors.roamingEdge} stopOpacity={0} />
            <Stop offset="0.72" stopColor={colors.roamingEdge} stopOpacity={0} />
            <Stop offset="0.93" stopColor={colors.roamingEdge} stopOpacity={0.25} />
            <Stop offset="1" stopColor={colors.roamingEdge} stopOpacity={0.08} />
          </LinearGradient></Defs>
          <Rect width="100%" height="100%" rx={radius.xl - 1} fill="none" stroke="url(#roamingEdgeLight)" strokeWidth={1.2} />
        </Svg>
      </Animated.View>
      <View style={styles.copy} pointerEvents="none">
        <Text style={styles.title}>随心<Text style={styles.titleAccent}>漫游</Text></Text>
        <Text style={styles.subtitle}>{isRoaming ? '好歌，接着来' : '下一首，随心听'}</Text>
      </View>
      <View style={[styles.devicePosition, compact && styles.compactDevice]} pointerEvents="none">
        <TurntableIllustration angle={angle} engaged={isRoaming} emitting={Boolean(isRoaming && playing)} reduceMotion={reduceMotion}
          artwork={isRoaming ? current?.artwork : undefined} artworkKey={`${current?.serverId ?? 'local'}:${current?.trackId ?? ''}`} />
      </View>
      <View style={styles.stateRow} pointerEvents="none">
        <Text style={styles.state}>{startingRadio ? '开启中' : isRoaming ? playing ? '漫游中' : '已暂停' : '未开启'}</Text>
        {startingRadio && <View style={styles.loadingSlot}>
          <ActivityIndicator size="small" color={colors.roamingSupportingText} style={styles.loadingSpinner} />
        </View>}
      </View>
    </>
  )
  const statusOnly = isRoaming && !startingRadio
  // 外层保持同一个 View，开启时不重建唱片机，唱臂才能从停靠位置连续落针。
  return (
    <View
      style={[styles.card, disabled && styles.disabled]}
      onLayout={onLayout}
      accessible={statusOnly}
      accessibilityRole={statusOnly ? 'text' : undefined}
      accessibilityLabel={statusOnly ? '随心漫游，已开启' : undefined}
      accessibilityValue={statusOnly ? { text: playing ? '漫游中' : '已暂停' } : undefined}
    >
      {content}
      {!statusOnly && <Pressable
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
        onPress={handlePress}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={startingRadio ? '正在开始随心漫游' : '开始随心漫游'}
        accessibilityState={{ busy: startingRadio, disabled: blocked }}
      />}
    </View>
  )
}

/** 唱片机背光：在机身周围局部聚散与呼吸，保持文字区安静；暂停保留形态。 */
function AmbientGlow({ clock, intensity, cardWidth, cardHeight, color, size, speed, offset, strength, id }: {
  clock: SharedValue<number>
  intensity: SharedValue<number>
  cardWidth: SharedValue<number>
  cardHeight: SharedValue<number>
  color: string
  size: [number, number]
  speed: number
  offset: number
  strength: number
  id: string
}) {
  const [width, height] = size
  const style = useAnimatedStyle(() => {
    const time = clock.value * Math.PI * 2
    const phase = time * speed + offset
    const merge = (1 - Math.cos(time)) / 2
    const spread = 0.06 + 0.94 * (1 - merge) ** 1.3
    // 和右下角 110 × 82.5 pt 的机身对齐，漂移不再按整张卡片放大。
    const centerX = cardWidth.value - 66 + Math.cos(time) * 4
    const centerY = cardHeight.value - 43 + Math.sin(time * 2) * 3
    return {
      // 聚拢时降低每层能量，避免叠成高亮白斑。
      opacity: intensity.value * (0.78 - merge * 0.2),
      transform: [
        { translateX: centerX - width / 2 + 10 * spread * Math.cos(phase) },
        { translateY: centerY - height / 2 + 6 * spread * Math.sin(phase) },
        { rotate: `${Math.sin(phase) * 14}deg` },
        { scaleX: 0.86 + Math.sin(time * 2 + offset) * 0.12 + merge * 0.14 },
        { scaleY: 0.86 + Math.cos(time * 3 + offset) * 0.1 + merge * 0.12 },
      ],
    }
  })
  const gradient = `roamingAura-${id}`
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}
    pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs><RadialGradient id={gradient}>
        <Stop offset="0" stopColor={color} stopOpacity={strength} />
        <Stop offset="0.28" stopColor={color} stopOpacity={strength * 0.92} />
        <Stop offset="0.6" stopColor={color} stopOpacity={strength * 0.48} />
        <Stop offset="0.85" stopColor={color} stopOpacity={strength * 0.12} />
        <Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient></Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#${gradient})`} />
    </Svg>
  </Animated.View>
}

const useStyles = createThemedStyles((colors) => ({
  card: {
    flex: 1, minWidth: 0, minHeight: HERO_STATION_CARD_HEIGHT,
    borderRadius: radius.xl, backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineBorder,
    padding: spacing.lg, overflow: 'hidden', justifyContent: 'space-between',
  },
  pressed: { backgroundColor: colors.shadow, opacity: 0.12 },
  edgeLight: { position: 'absolute', top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  disabled: { opacity: 0.5 },
  copy: { zIndex: 1, gap: 4 },
  title: { ...typography.title3, color: colors.textPrimary },
  titleAccent: { color: colors.roamingTitleAccent },
  subtitle: { ...typography.caption, color: colors.roamingSupportingText },
  stateRow: { flexDirection: 'row', alignItems: 'center', minHeight: 18, gap: 5, zIndex: 1, maxWidth: '55%' },
  state: { ...typography.caption, lineHeight: 18, color: colors.roamingSupportingText, flexShrink: 1 },
  loadingSlot: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  loadingSpinner: { transform: [{ scale: 0.6 }] },
  devicePosition: { position: 'absolute', right: 6, bottom: 0 },
  compactDevice: { right: -4, bottom: 3, transform: [{ scale: 0.8 }], transformOrigin: 'right bottom' },
}))
