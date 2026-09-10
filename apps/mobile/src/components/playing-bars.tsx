import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useIsPlaying } from 'react-native-track-player'
import { colors } from '@/theme/tokens'

/**
 * 「正在播放」动态音符/律动条 (Live Playing Indicator):
 * - 默认高度为 11pt（严格比 15pt 歌名词条矮，视觉均衡，不喧宾夺主）；
 * - 横向排布三根宽度 2.2pt、间距 2.4pt 的等距竖线；
 * - 初始/暂停状态收拢为三枚平齐的圆点（...），圆角与宽平齐；
 * - 播放时在 UI 线程（Reanimated）中以不同频次和波峰向上律动跳起。
 */

const BAR_WIDTH = 2.2
const BAR_GAP = 2.4
const DEFAULT_HEIGHT = 11

interface BarConfig {
  maxRatio: number
  duration: number
}

const BARS: readonly BarConfig[] = [
  { maxRatio: 1.0, duration: 420 },
  { maxRatio: 0.65, duration: 560 },
  { maxRatio: 0.88, duration: 360 },
]

interface PlayingBarsProps {
  /** 整体最大高度，默认 11（小于 15pt 歌名词条） */
  size?: number
  color?: string
  /** false 时停止跳动，并平滑收拢为三枚平齐的圆点 (...) */
  animating?: boolean
}

function Bar({
  config,
  size,
  color,
  animating,
}: {
  config: BarConfig
  size: number
  color: string
  animating: boolean
}) {
  const minHeight = BAR_WIDTH
  const maxHeight = Math.max(minHeight, size * config.maxRatio)
  const height = useSharedValue(minHeight)

  useEffect(() => {
    if (animating) {
      height.value = withRepeat(
        withTiming(maxHeight, {
          duration: config.duration,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      )
    } else {
      cancelAnimation(height)
      height.value = withTiming(minHeight, { duration: 180 })
    }
    return () => cancelAnimation(height)
  }, [animating, config, maxHeight, minHeight, height])

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }))

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: color,
          width: BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
        },
        animatedStyle,
      ]}
    />
  )
}

export function PlayingBars({
  size = DEFAULT_HEIGHT,
  color = colors.playing,
  animating = true,
}: PlayingBarsProps) {
  return (
    <View
      style={[styles.container, { height: size }]}
      accessible
      accessibilityLabel={animating ? '正在播放' : '已暂停'}
    >
      {BARS.map((config, index) => (
        <Bar
          key={index}
          config={config}
          size={size}
          color={color}
          animating={animating}
        />
      ))}
    </View>
  )
}

/**
 * 跟随播放器状态的律动条。
 * 只在「正在播放的那一行」渲染，所以 useIsPlaying 全列表只订阅一次，
 * 不会每行都挂一个播放状态监听。
 */
export function LivePlayingBars({
  size = DEFAULT_HEIGHT,
  color = colors.playing,
}: {
  size?: number
  color?: string
}) {
  const { playing } = useIsPlaying()
  return <PlayingBars size={size} color={color} animating={playing ?? false} />
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: BAR_GAP,
    paddingBottom: 1, // 光学微调：对齐字体基准线
  },
  bar: {
    // 基础圆角在 style 内动态赋予 borderRadius: BAR_WIDTH / 2
  },
})
