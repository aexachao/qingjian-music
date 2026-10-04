import { useMemo } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import type { AmbientPalette } from '@/theme/ambient-palette'
import { createThemedStyles, useAppTheme } from '@/theme/theme-provider'
import { useServerSession } from '@/lib/server-session'

export interface AmbientHeaderBackgroundProps {
  palette: AmbientPalette
  height?: number
  coverId?: string
  coverUrl?: string
}

/**
 * 详情页顶部统一流体弥散氛围光底色（Ambient Header Background）：
 * - 如果提供了 coverId，直接使用原图进行超大半径高斯模糊，实现原生级的真实「封面取色」；
 * - 否则 fallback 采用双重抽象光斑（Primary + Secondary）；
 * - 叠加非线性遮罩平滑汇入页面深色底色，消除纯黑背景的冰冷感；
 * - 浅色模式下采用无黑色介入的自然渐变衰减，避免彩色弥散与浅灰底色相交产生发灰/发脏的泥泞感；
 * - 广泛应用于 专辑、歌单、流派与收藏 详情页。
 */
export function AmbientHeaderBackground({ palette, height = 480, coverId, coverUrl }: AmbientHeaderBackgroundProps) {
  const { colors, mode } = useAppTheme()
  const styles = useStyles()
  const { provider } = useServerSession()

  const gradientColors = useMemo(() => {
    if (mode === 'dark') {
      return ['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', colors.bgPrimary] as const
    }
    // 浅色模式下切忌叠加黑色（rgba(0,0,0,0.3)），否则会导致鲜亮彩色流体光过渡处发灰发脏（泥泞感）。
    // 使用纯净的浅色底色透明度平滑过渡融入页面背景。
    return [`${colors.bgPrimary}00`, `${colors.bgPrimary}66`, colors.bgPrimary] as const
  }, [mode, colors.bgPrimary])

  const resource = useMemo(() => {
    if (coverUrl) return { url: coverUrl, headers: {} }
    if (!coverId || !provider) return null
    return provider.image(coverId, 400)
  }, [coverId, coverUrl, provider])

  return (
    <View style={[styles.ambientRoot, { height }]} pointerEvents="none">
      <View style={styles.ambientBlobContainer}>
        {resource ? (
          <Image
            source={{ uri: resource.url, headers: resource.headers }}
            style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.35 }] }]}
            contentFit="cover"
            blurRadius={120}
            cachePolicy="memory-disk"
          />
        ) : (
          <>
            <View
              style={[
                styles.ambientBlob,
                styles.ambientBlobPrimary,
                { backgroundColor: palette.primary },
              ]}
            />
            <View
              style={[
                styles.ambientBlob,
                styles.ambientBlobSecondary,
                { backgroundColor: palette.secondary },
              ]}
            />
          </>
        )}
      </View>
      {resource ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgPrimary, opacity: mode === 'dark' ? 0.38 : 0.18 }]} /> : null}
      {!resource ? <BlurView
        intensity={Platform.OS === 'ios' ? 90 : 100}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      /> : null}
      <LinearGradient
        colors={gradientColors}
        locations={[0.25, 0.65, 1.0]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

const useStyles = createThemedStyles((_colors) => ({
  ambientRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  ambientBlobContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ambientBlob: {
    position: 'absolute',
  },
  ambientBlobPrimary: {
    top: -20,
    left: -30,
    width: 290,
    height: 290,
    borderRadius: 145,
    opacity: 0.72,
  },
  ambientBlobSecondary: {
    top: 40,
    right: -40,
    width: 270,
    height: 270,
    borderRadius: 135,
    opacity: 0.6,
  },
}))
