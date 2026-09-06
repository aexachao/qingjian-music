import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import TrackPlayer from 'react-native-track-player'
import { Icon, iconSize } from '@/components/icon'
import { colors, radius, spacing } from '@/theme/tokens'

const TRACK_HEIGHT = 4

/**
 * 播放音量条（App 内的播放增益，不是系统音量）。
 * 放在传输控制和底部工具栏之间，顺便把这两行拉开距离。
 */
export function VolumeBar() {
  const width = useSharedValue(0)
  const level = useSharedValue(1)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void TrackPlayer.getVolume()
      .then((value) => {
        if (!alive) return
        level.value = Math.min(Math.max(value, 0), 1)
        setReady(true)
      })
      .catch(() => setReady(true))
    return () => {
      alive = false
    }
  }, [level])

  const apply = useCallback((value: number) => {
    void TrackPlayer.setVolume(value).catch((error: unknown) => {
      // 音量设置失败不影响播放，忽略即可
      console.warn('设置音量失败', error)
    })
  }, [])

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      if (width.value <= 0) return
      level.value = Math.min(Math.max(event.x / width.value, 0), 1)
      runOnJS(apply)(level.value)
    })
    .onUpdate((event) => {
      if (width.value <= 0) return
      level.value = Math.min(Math.max(event.x / width.value, 0), 1)
      runOnJS(apply)(level.value)
    })

  const fillStyle = useAnimatedStyle(() => ({ width: `${level.value * 100}%` }))

  return (
    <View style={styles.container}>
      <Icon name="volumeDown" size={iconSize.sm} color={colors.iconDim} />
      <GestureDetector gesture={pan}>
        <View
          style={styles.hitArea}
          onLayout={(event) => {
            width.value = event.nativeEvent.layout.width
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="音量"
        >
          <View style={styles.track}>{ready ? <Animated.View style={[styles.fill, fillStyle]} /> : null}</View>
        </View>
      </GestureDetector>
      <Icon name="volumeUp" size={iconSize.md} color={colors.iconDim} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // 竖向留出可点区域，但视觉上还是一根细线
  hitArea: { flex: 1, paddingVertical: spacing.md, justifyContent: 'center' },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.playerProgressTrack,
    overflow: 'hidden',
  },
  fill: { height: TRACK_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.textSecondary },
})
