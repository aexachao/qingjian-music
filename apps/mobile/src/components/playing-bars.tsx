import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { useIsPlaying } from 'react-native-track-player'
import { colors } from '@/theme/tokens'

/**
 * 「正在播放」的动态律动条：列表里标识当前那首歌，跳动的比静态图标更容易一眼看到。
 *
 * 三根柱子的高度区间和周期都不一样，相位自然错开，才不会像整体缩放的一根柱子；
 * 暂停时收回到最低高度并停住，用静止表达「停了」，不用换图标。
 * 动画跑在 UI 线程（reanimated），列表滚动时不掉帧。
 */

interface BarConfig {
  min: number
  max: number
  duration: number
}

const BARS: readonly BarConfig[] = [
  { min: 0.32, max: 1, duration: 420 },
  { min: 0.2, max: 0.72, duration: 560 },
  { min: 0.44, max: 0.92, duration: 340 },
]

interface PlayingBarsProps {
  /** 整体高度，柱子宽度按它推算 */
  size?: number
  color?: string
  /** false 时停止跳动（暂停中） */
  animating?: boolean
}

function Bar({ config, size, color, animating }: { config: BarConfig; size: number; color: string; animating: boolean }) {
  const ratio = useSharedValue(config.min)

  useEffect(() => {
    if (animating) {
      ratio.value = withRepeat(
        withTiming(config.max, { duration: config.duration, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      )
    } else {
      cancelAnimation(ratio)
      ratio.value = withTiming(config.min, { duration: 160 })
    }
    return () => cancelAnimation(ratio)
  }, [animating, config, ratio])

  const animatedStyle = useAnimatedStyle(() => ({ height: size * ratio.value }))

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: color, width: Math.max(2, Math.round(size / 8)) }, animatedStyle]}
    />
  )
}

export function PlayingBars({ size = 20, color = colors.playing, animating = true }: PlayingBarsProps) {
  return (
    <View
      style={[styles.container, { height: size }]}
      accessible
      accessibilityLabel={animating ? '正在播放' : '已暂停'}
    >
      {BARS.map((config) => (
        <Bar key={config.duration} config={config} size={size} color={color} animating={animating} />
      ))}
    </View>
  )
}

/**
 * 跟随播放器状态的律动条。
 * 只在「正在播放的那一行」渲染，所以 useIsPlaying 全列表只订阅一次，
 * 不会每行都挂一个播放状态监听。
 */
export function LivePlayingBars({ size = 20, color = colors.playing }: { size?: number; color?: string }) {
  const { playing } = useIsPlaying()
  return <PlayingBars size={size} color={color} animating={playing ?? false} />
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  bar: { borderRadius: 1 },
})
