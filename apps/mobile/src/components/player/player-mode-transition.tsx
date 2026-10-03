import type { ReactNode } from 'react'
import type { ViewStyle } from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'

export const PLAYER_MODE_TIMING = {
  duration: 360,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  reduceMotion: ReduceMotion.System,
} as const

interface PlayerModeLayerProps {
  progress: SharedValue<number>
  active: boolean
  children: ReactNode
  style?: ViewStyle
}

export function PlayerModeLayer({ progress, active, children, style }: PlayerModeLayerProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.85], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [14, 0], Extrapolation.CLAMP) }],
  }))

  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, animatedStyle, style]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  )
}
