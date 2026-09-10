import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const TRACK_HEIGHT = 6
/** 手指按住时整条轨道放大到多少倍（对齐 Apple Music 的按压反馈） */
const PRESSED_SCALE = 3
// Apple Music 级的按压形变不需要回弹。
// 在 Reanimated 物理引擎中，临界阻尼 (dampingRatio = 1) 对应公式为 damping = 2 * sqrt(mass * stiffness)。
// 对于 stiffness: 300, mass: 1，算得 damping 约为 34.6
const SPRING_CONFIG = { damping: 34.6, stiffness: 300 }

interface ProgressBarProps {
  /** 当前进度（秒） */
  position: number
  /** 总时长（秒） */
  duration: number
  onSeek: (seconds: number) => void
  /** 位于开始时间与结束时间正中间的音源规格信息（如：原文件 · FLAC · 716 kbps） */
  centerLabel?: string
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

/**
 * 自绘进度条：拖动时用手势值，松手才 seek，避免与播放回调打架。
 * 按住时整条轨道放大、已播部分从半透明白变纯白，松手还原。
 */
export function ProgressBar({ position, duration, onSeek, centerLabel }: ProgressBarProps) {
  const width = useSharedValue(0)
  const dragRatio = useSharedValue(-1)
  const initialRatio = useSharedValue(0)
  /** 按压进度 0→1：驱动放大与变色，onFinalize 兜底（手势被打断也要还原） */
  const pressed = useSharedValue(0)
  const [dragSeconds, setDragSeconds] = useState<number | null>(null)

  const ratio = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0
  // 播放进度每半秒变一次：用派生值同步到 UI 线程，不能在 render 里直接写 shared value
  const playedRatio = useDerivedValue(() => ratio, [ratio])

  const commitSeek = useCallback(
    (value: number) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onSeek(value)
      // 延迟 500ms 重置手势状态，避免 TrackPlayer 进度更新延迟导致的“回闪”现象
      setTimeout(() => {
        dragRatio.value = -1
        setDragSeconds(null)
      }, 500)
    },
    [onSeek, dragRatio],
  )

  const pan = Gesture.Pan()
    .minDistance(0)
    .failOffsetY([-14, 14])
    .hitSlop({ top: 16, bottom: 16 }) // 扩大手势感应区，保持视觉紧凑的同时满足 HIG 标准
    .onBegin(() => {
      runOnJS(Haptics.selectionAsync)()
      pressed.value = withSpring(1, SPRING_CONFIG)
      dragRatio.value = ratio
      initialRatio.value = ratio
    })
    .onUpdate((event) => {
      if (width.value <= 0) return
      const newRatio = Math.min(Math.max(initialRatio.value + event.translationX / width.value, 0), 1)
      dragRatio.value = newRatio
      runOnJS(setDragSeconds)(newRatio * duration)
    })
    .onEnd(() => {
      const value = dragRatio.value * duration
      runOnJS(commitSeek)(value)
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 250 })
    })

  const trackStyle = useAnimatedStyle(() => ({
    height: TRACK_HEIGHT + (TRACK_HEIGHT * PRESSED_SCALE - TRACK_HEIGHT) * pressed.value,
  }))
  const fillStyle = useAnimatedStyle(() => ({
    height: '100%',
    width: `${(dragRatio.value >= 0 ? dragRatio.value : playedRatio.value) * 100}%`,
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [colors.playerProgressFill, colors.playerProgressFillActive],
    ),
  }))

  const shown = dragSeconds ?? position

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hitArea}
          hitSlop={{ top: 20, bottom: 20 }}
          onLayout={(event) => {
            width.value = event.nativeEvent.layout.width
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="播放进度"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}
        >
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.labels}>
        <Text style={[styles.time, styles.timeLeft]}>{formatTime(shown)}</Text>
        {centerLabel ? (
          <Text style={styles.centerInfo} numberOfLines={1}>
            {centerLabel}
          </Text>
        ) : null}
        <Text style={[styles.time, styles.timeRight]}>-{formatTime(Math.max(duration - shown, 0))}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  hitArea: { height: 16, justifyContent: 'center' }, // 视觉高度减小，靠 hitSlop 保证点击区
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.playerProgressTrack,
    overflow: 'hidden',
  },
  fill: {},
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
    minWidth: 48,
  },
  timeLeft: {
    textAlign: 'left',
  },
  timeRight: {
    textAlign: 'right',
  },
  centerInfo: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    flexShrink: 1,
    paddingHorizontal: spacing.xs,
  },
})
