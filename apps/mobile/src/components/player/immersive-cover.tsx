import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { BrandMark } from '@/components/brand-mark'
import { useThemeColors } from '@/theme/theme-provider'
import { useServerSession } from '@/lib/server-session'

/** 全屏封面的高清尺寸：飞牛 size>=~1000 直接返回原图，足够 3x 屏铺满不糊 */
const IMMERSIVE_COVER_SIZE = 1200

/**
 * 悬浮正方形专辑卡片（Floating Album Card）：
 * - 对齐 Apple Music 经典规范，不再对图片进行全屏拉伸；
 * - 以正方形卡片形式悬浮于抽象弥散流体光斑之上；
 * - 携带精致微圆角（borderRadius: 14）与环境深色软阴影；
 * - 画面 100% 完整清晰呈现，拒绝任何畸变、裁切或黑雾遮挡。
 */
export function ViewportCover({
  artwork,
  coverId,
  fill = false,
}: {
  artwork?: HttpResource | undefined
  coverId?: string | undefined
  fill?: boolean
}) {
  const colors = useThemeColors()
  const { provider } = useServerSession()
  const hd = coverId && provider ? provider.image(coverId, IMMERSIVE_COVER_SIZE) : undefined
  const source = hd ?? artwork

  const containerStyle = fill ? styles.cardContainerFill : styles.cardContainer

  if (!source) {
    return (
      <View style={[containerStyle, styles.placeholderBox, { backgroundColor: colors.coverPlaceholder }]}>
        <BrandMark height={fill ? 140 : 120} color={colors.coverPlaceholderMark} />
      </View>
    )
  }

  return (
    <View style={containerStyle}>
      <View style={fill ? styles.cardInnerFill : styles.cardInner}>
        <Image
          source={{ uri: source.url, headers: source.headers }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      </View>
    </View>
  )
}

/**
 * 沉浸式暗化渐变遮罩：
 * - 顶部轻防眩：保证状态栏与拖动条在浅色极光下清晰可辨；
 * - 底部由底层的 AmbientMeshBackground 内置 Scrim 统一管理，避免重叠过度压黑。
 */
export function ImmersiveDarkOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']}
        locations={[0, 0.14]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

/** 兼容原有 ImmersiveCover 调用的别名 */
export const ImmersiveCover = ImmersiveDarkOverlay

const styles = StyleSheet.create({
  cardContainer: {
    width: '84%',
    maxWidth: 340,
    aspectRatio: 1,
    borderRadius: 14,
    // iOS / Android 环境软阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    elevation: 12,
  },
  cardContainerFill: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    elevation: 12,
  },
  cardInner: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardInnerFill: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  placeholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
