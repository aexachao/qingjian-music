import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Icon, iconSize } from '@/components/icon'
import { select } from '@/lib/haptics'
import { useThemeColors } from '@/theme/theme-provider'
import { SystemVolumeSlider, addVolumeListener, getSystemVolume, setSystemVolume } from '../../../modules/system-volume'
import { useStyles } from './player-deck.styles'

export function VolumeBar({ onInteractionStart, onInteractionEnd }: { onInteractionStart?: () => void; onInteractionEnd?: () => void }) {
  const colors = useThemeColors()
  const styles = useStyles()
  const currentVol = getSystemVolume()
  const volume = useSharedValue(currentVol)
  const pressed = useSharedValue(0)
  const initialVolume = useSharedValue(currentVol)
  const sliderWidth = useSharedValue(300)

  useEffect(() => {
    // 挂载时立即拉取真实系统音量校准
    const latest = getSystemVolume()
    if (pressed.value === 0 && Math.abs(volume.value - latest) > 0.005) {
      volume.value = latest
    }
    const sub = addVolumeListener((e) => {
      // 只有在没被按住的时候，才接受系统音量变化
      if (pressed.value === 0) {
        volume.value = withSpring(e.volume, { damping: 34.6, stiffness: 300 })
      }
    })
    return () => sub.remove()
  }, [volume, pressed])

  const pan = Gesture.Pan()
    .failOffsetY([-14, 14])
    .onBegin(() => {
      if (onInteractionStart) runOnJS(onInteractionStart)()
      runOnJS(select)()
      pressed.value = withSpring(1, { damping: 34.6, stiffness: 300 })
      initialVolume.value = volume.value
    })
    .onChange((event) => {
      const width = sliderWidth.value || 300
      const delta = event.translationX / width
      let next = initialVolume.value + delta
      next = Math.max(0, Math.min(1, next))
      volume.value = next
      runOnJS(setSystemVolume)(next)
    })
    .onFinalize(() => {
      if (onInteractionEnd) runOnJS(onInteractionEnd)()
      pressed.value = withTiming(0, { duration: 250 })
    })

  const trackStyle = useAnimatedStyle(() => ({
    height: 6 + (6 * 3 - 6) * pressed.value,
  }))

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, volume.value)) * 100}%`,
    height: '100%',
  }))

  return (
    <View style={styles.volumeRow}>
      <Icon name="volumeDown" size={iconSize.md} color={colors.iconDim} />
      
      <GestureDetector gesture={pan}>
        <View
          style={styles.volumeSliderContainer}
          hitSlop={{ top: 12, bottom: 12 }}
          onLayout={(e) => {
            sliderWidth.value = e.nativeEvent.layout.width
          }}
        >
          <Animated.View style={[styles.volumeTrack, trackStyle]}>
            <Animated.View style={[styles.volumeFill, fillStyle]} />
          </Animated.View>

          {/* 纯粹用于抑制系统音量 HUD 的幽灵视图，没有实际 UI 和交互 */}
          <SystemVolumeSlider pointerEvents="none" style={StyleSheet.absoluteFill} />
        </View>
      </GestureDetector>

      <Icon name="volumeUp" size={iconSize.md} color={colors.iconDim} />
    </View>
  )
}
