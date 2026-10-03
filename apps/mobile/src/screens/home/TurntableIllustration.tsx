import { useEffect, useState } from 'react'
import { Image as ArtworkImage } from 'expo-image'
import type { HttpResource } from '@qj/core-domain'
import { Image, StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import { tonearmPose, tonearmTarget } from './turntable-motion'
import { useThemeColors } from '@/theme/theme-provider'

// 对齐透明底渲染素材的 1440 × 1080 画布。机身与光源固定，表面细纹独立旋转。
const WIDTH = 110
const HEIGHT = WIDTH * 0.75
const SCALE = WIDTH / 144
const AnimatedGroup = Animated.createAnimatedComponent(G<{ matrix?: number[] }>)

export function TurntableIllustration({ angle, engaged, emitting, reduceMotion, artwork, artworkKey }: {
  artwork?: HttpResource
  artworkKey?: string
  angle: SharedValue<number>
  engaged: boolean
  emitting: boolean
  reduceMotion: boolean
}) {
  const colors = useThemeColors()
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null)
  const cover = engaged ? artwork : undefined
  const coverKey = `${artworkKey ?? 'local'}:${cover?.url ?? ''}`
  useEffect(() => setFailedArtwork(null), [coverKey, cover?.headers])
  const arm = useSharedValue(tonearmTarget(engaged, emitting))
  const lamp = useSharedValue(emitting ? 1 : engaged ? 0.2 : 0)
  useEffect(() => {
    const target = tonearmTarget(engaged, emitting)
    arm.value = withTiming(target, {
      duration: reduceMotion ? 0 : Math.max(180, Math.abs(target - arm.value) * 1000),
      easing: Easing.linear,
    })
    lamp.value = withTiming(emitting ? 1 : engaged ? 0.2 : 0, { duration: reduceMotion ? 0 : 260 })
    return () => { cancelAnimation(arm); cancelAnimation(lamp) }
  }, [arm, lamp, engaged, emitting, reduceMotion])
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.value }))
  const recordStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }))
  const armProps = useAnimatedProps(() => {
    const pose = tonearmPose(arm.value)
    const radians = pose.angle * Math.PI / 180
    const c = Math.cos(radians)
    const s = Math.sin(radians)
    const d = c - pose.lift * 0.1
    // 保持转轴固定，抬针只改变唱臂的投影高度。
    return { matrix: [c, s, -s, d, 121.5 - c * 121.5 + s * 29, 29 - s * 121.5 - d * 29] as [number, number, number, number, number, number] }
  })


  return (
    <View style={styles.device} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={require('../../../assets/images/roaming-turntable-body-v2.png')} style={styles.body} />
      <View style={styles.recordPlane}>
        <Animated.View style={[styles.record, recordStyle]}>
          <Svg width={72} height={72} viewBox="0 0 100 100">
            {[27, 31, 36, 40, 45, 48].map((r, index) => (
              <Circle key={r} cx={50} cy={50} r={r} fill="none" stroke={colors.roamingMetal}
                strokeWidth={0.2} strokeOpacity={0.24} strokeDasharray={`${4 + index * 2} ${r * 4}`} />
            ))}
          </Svg>
          <View style={[styles.label, { backgroundColor: colors.roamingLabelPaper }]}>
            {cover && failedArtwork !== coverKey && <ArtworkImage
              source={{ uri: cover.url, headers: cover.headers, cacheKey: coverKey }}
              style={styles.artwork} contentFit="cover" cachePolicy="memory-disk"
              recyclingKey={coverKey} transition={reduceMotion ? 0 : 200}
              onError={() => setFailedArtwork(coverKey)} accessibilityIgnoresInvertColors
            />}
            <Svg width={26} height={26} viewBox="0 0 26 26" style={StyleSheet.absoluteFill}>
              <Path d="M11 1.1H15M11.8 2.1H14.2" stroke={colors.roamingDeckFront} strokeWidth={0.5} strokeOpacity={0.55} />
              <Circle cx={13} cy={13} r={1} fill={colors.roamingDeckFront} />
            </Svg>
          </View>
        </Animated.View>
      </View>
        <Svg width={WIDTH} height={HEIGHT} viewBox="0 0 144 108" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="armMetal" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.roamingDeckFront} />
              <Stop offset="0.38" stopColor={colors.roamingMetal} />
              <Stop offset="0.58" stopColor={colors.roamingMetal} />
              <Stop offset="1" stopColor={colors.roamingDeck} />
            </LinearGradient>
            <LinearGradient id="cartridge" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.roamingMetal} />
              <Stop offset="0.45" stopColor={colors.roamingDeck} />
              <Stop offset="1" stopColor={colors.roamingDeckFront} />
            </LinearGradient>
          </Defs>
          <Ellipse cx={62.4} cy={46.2} rx={1.25} ry={0.7} fill={colors.roamingDeckFront} />
          <Path d="M62.4 46L62.4 43.2" stroke={colors.roamingMetal} strokeWidth={1.15} strokeLinecap="round" />
          <Ellipse cx={62.4} cy={43.2} rx={0.6} ry={0.3} fill={colors.roamingLampCore} opacity={0.7} />
          <AnimatedGroup animatedProps={armProps}>
          <Path d="M121.9 30.1L124.4 56.8" stroke={colors.shadow} strokeWidth={3} strokeOpacity={0.45} strokeLinecap="round" />
          <Path d="M120.5 29L123.2 55.7L125.1 55.5L122.7 28.8Z" fill="url(#armMetal)" />
          <Path d="M121.3 29.8L123.8 55" stroke={colors.roamingMetal} strokeOpacity={0.8} strokeWidth={0.35} />
          <Ellipse cx={121.6} cy={29.2} rx={1.5} ry={1.2} fill={colors.roamingDeckFront} stroke={colors.roamingMetal} strokeWidth={0.35} />
          <Path d="M121.9 55.5L126.3 55.1L127 60.2L122.6 60.7Z" fill="url(#cartridge)" stroke={colors.roamingMetal} strokeWidth={0.25} />
          <Path d="M122.6 60.7L127 60.2L127 62.1L123 62.5Z" fill={colors.roamingDeckFront} />
          <Path d="M124.1 62L124.2 63" stroke={colors.roamingRecordLabel} strokeWidth={0.5} />
          <Circle cx={124.1} cy={56.6} r={0.3} fill={colors.roamingMetal} />
          </AnimatedGroup>
        </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, lampStyle]}><Svg width={WIDTH} height={HEIGHT} viewBox="0 0 144 108" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ledGlow">
            <Stop offset="0" stopColor={colors.roamingLamp} stopOpacity={0.45} />
            <Stop offset="0.35" stopColor={colors.roamingLamp} stopOpacity={0.12} />
            <Stop offset="1" stopColor={colors.roamingLamp} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={120.5} cy={81} r={5} fill="url(#ledGlow)" />
        <Circle cx={120.5} cy={81} r={1.6} fill={colors.roamingLamp} />
        <Circle cx={120.3} cy={80.8} r={0.85} fill={colors.roamingLampCore} opacity={0.95} />
      </Svg></Animated.View>

    </View>
  )
}

const styles = StyleSheet.create({
  device: { width: WIDTH, height: HEIGHT },
  body: { width: WIDTH, height: HEIGHT },
  recordPlane: { position: 'absolute', left: 62.4 * SCALE - 36, top: 46.2 * SCALE - 36, width: 72, height: 72, transform: [{ scaleY: 0.45 }] },
  record: { width: 72, height: 72 },
  label: { position: 'absolute', left: 23, top: 23, width: 26, height: 26, borderRadius: 13, overflow: 'hidden' },
  artwork: { position: 'absolute', left: 1.5, top: 1.5, width: 23, height: 23, borderRadius: 11.5 },
})
