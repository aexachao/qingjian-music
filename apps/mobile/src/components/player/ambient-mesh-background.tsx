import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import type { AmbientPalette } from '@/theme/ambient-palette'

interface AmbientMeshBackgroundProps {
  palette: AmbientPalette
  /** 是否隐藏底部的暗化渐变蒙版（如歌词页全屏滚动时） */
  hideScrim?: boolean
}

/**
 * Apple Music 风格的抽象流动弥散光斑背景（Ambient Mesh Background）：
 * - 底层：全屏纯深黑托底（palette.background）；
 * - 中层：3 个抽象不规则色块（主色、高光、暗基色）+ 超大高斯模糊（BlurView 85px~100px），融合成极光雾；
 * - 缓动动效：UI 线程驱动的 14s~17s 正弦流体呼吸，赋予背景有机生命力；
 * - 顶层遮罩：从中下部开始的线性渐变暗化（Gradient Scrim），保障白色控件的高对比度与清晰度。
 */
export function AmbientMeshBackground({ palette, hideScrim = false }: AmbientMeshBackgroundProps) {
  const anim1 = useSharedValue(0)
  const anim2 = useSharedValue(0)

  useEffect(() => {
    anim1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    )
    anim2.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 17000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 17000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    )
  }, [anim1, anim2])

  const blob1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(anim1.value, [0, 1], [-12, 18]) },
      { translateY: interpolate(anim1.value, [0, 1], [0, 26]) },
      { scale: interpolate(anim1.value, [0, 1], [1, 1.16]) },
    ],
  }))

  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(anim2.value, [0, 1], [14, -16]) },
      { translateY: interpolate(anim2.value, [0, 1], [0, -22]) },
      { scale: interpolate(anim2.value, [0, 1], [1.14, 0.94]) },
    ],
  }))

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]} pointerEvents="none">
      {/* 弥散光斑层 */}
      <View style={StyleSheet.absoluteFill}>
        {/* Blob 1：主导强调色（中上部偏左） */}
        <Animated.View
          style={[
            styles.blob,
            styles.blobPrimary,
            { backgroundColor: palette.primary },
            blob1Style,
          ]}
        />

        {/* Blob 2：明亮次级氛围高光（中部偏右） */}
        <Animated.View
          style={[
            styles.blob,
            styles.blobSecondary,
            { backgroundColor: palette.secondary },
            blob2Style,
          ]}
        />

        {/* Blob 3：深基调色（中下部稳固托底） */}
        <View
          style={[
            styles.blob,
            styles.blobDark,
            { backgroundColor: palette.dark },
          ]}
        />
      </View>

      {/* 超大高斯模糊：将几何圆形彻底化作无边界的柔和极光雾 */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 100}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />

      {/* 渐进式暗化遮罩（Gradient Scrim）：50% 往下平滑过渡到深沉暗色，衬托纯白控制器 */}
      {!hideScrim ? (
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.36)', 'rgba(0,0,0,0.82)']}
          locations={[0.46, 0.72, 1.0]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  )
}

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const

const styles = StyleSheet.create({
  root: {
    ...fill,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
  },
  blobPrimary: {
    top: '18%',
    left: '-12%',
    width: 330,
    height: 330,
    borderRadius: 165,
    opacity: 0.82,
  },
  blobSecondary: {
    top: '38%',
    right: '-14%',
    width: 290,
    height: 290,
    borderRadius: 145,
    opacity: 0.76,
  },
  blobDark: {
    top: '56%',
    left: '10%',
    width: 360,
    height: 360,
    borderRadius: 180,
    opacity: 0.90,
  },
})
