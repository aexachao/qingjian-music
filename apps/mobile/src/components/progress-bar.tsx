import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated'
import { colors, radius, spacing, typography } from '@/theme/tokens'

const TRACK_HEIGHT = 6

interface ProgressBarProps {
  /** 当前进度（秒） */
  position: number
  /** 总时长（秒） */
  duration: number
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

/** 自绘进度条：拖动时用手势值，松手才 seek，避免与播放回调打架 */
export function ProgressBar({ position, duration, onSeek }: ProgressBarProps) {
  const width = useSharedValue(0)
  const dragRatio = useSharedValue(-1)
  const [dragSeconds, setDragSeconds] = useState<number | null>(null)

  const ratio = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0
  // 播放进度每半秒变一次：用派生值同步到 UI 线程，不能在 render 里直接写 shared value
  const playedRatio = useDerivedValue(() => ratio, [ratio])

  const commitSeek = useCallback(
    (value: number) => {
      setDragSeconds(null)
      onSeek(value)
    },
    [onSeek],
  )

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      if (width.value <= 0) return
      dragRatio.value = Math.min(Math.max(event.x / width.value, 0), 1)
      runOnJS(setDragSeconds)(dragRatio.value * duration)
    })
    .onUpdate((event) => {
      if (width.value <= 0) return
      dragRatio.value = Math.min(Math.max(event.x / width.value, 0), 1)
      runOnJS(setDragSeconds)(dragRatio.value * duration)
    })
    .onEnd(() => {
      const value = dragRatio.value * duration
      dragRatio.value = -1
      runOnJS(commitSeek)(value)
    })

  const fillStyle = useAnimatedStyle(() => ({
    width: `${(dragRatio.value >= 0 ? dragRatio.value : playedRatio.value) * 100}%`,
  }))

  const shown = dragSeconds ?? position

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hitArea}
          onLayout={(event) => {
            width.value = event.nativeEvent.layout.width
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="播放进度"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
        </View>
      </GestureDetector>
      <View style={styles.labels}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>-{formatTime(Math.max(duration - shown, 0))}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  hitArea: { paddingVertical: spacing.md, justifyContent: 'center' },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.playerProgressTrack,
    overflow: 'hidden',
  },
  // web 端 --ds-player-progress-fill 就是当前强调色
  fill: { height: TRACK_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.accent },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...typography.caption, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
})
