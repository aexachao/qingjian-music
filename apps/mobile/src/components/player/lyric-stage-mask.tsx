import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

/** The mask animates over a fixed lyric layout so chrome never changes scroll geometry. */
export interface LyricStageMaskProps {
  opacity: SharedValue<number>
  topInset: number
  bottomInset: number
  topFloor?: number
  bottomFloor?: number
}

export function LyricStageMask({ opacity, topInset, bottomInset, topFloor = 0, bottomFloor = 0 }: LyricStageMaskProps) {
  const topStyle = useAnimatedStyle(() => ({ height: topFloor + opacity.value * (topInset - topFloor) }))
  const bottomStyle = useAnimatedStyle(() => ({ height: bottomFloor + opacity.value * (bottomInset - bottomFloor) }))
  const topFadeStyle = useAnimatedStyle(() => ({ height: opacity.value * 28 }))
  const bottomFadeStyle = useAnimatedStyle(() => ({ height: opacity.value * 44 }))
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={topStyle} />
      <Animated.View style={topFadeStyle}>
        <LinearGradient colors={['transparent', 'black']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.body} />
      <Animated.View style={bottomFadeStyle}>
        <LinearGradient colors={['black', 'transparent']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={bottomStyle} />
    </View>
  )
}
const styles = StyleSheet.create({ body: { flex: 1, backgroundColor: 'black' } })
