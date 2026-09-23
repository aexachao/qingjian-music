import MaskedView from '@react-native-masked-view/masked-view'
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
 * 视口清晰专辑封面：
 * - 严格处于「导航栏底部至歌名行顶部」的舞台视口内；
 * - 按照屏幕宽度（width: 100%）铺满，aspectRatio: 1 保持正方形比例，
 *   彻底解决此前按高度放大导致左右主体被严重裁切的问题；
 * - 专辑图下边缘通过渐变 Mask 平滑羽化淡出，自然透出底层 CoverBackdrop 的边缘模糊拉伸光影。
 */
export function ViewportCover({
  artwork,
  coverId,
}: {
  artwork?: HttpResource | undefined
  coverId?: string | undefined
}) {
  const colors = useThemeColors()
  const { provider } = useServerSession()
  const hd = coverId && provider ? provider.image(coverId, IMMERSIVE_COVER_SIZE) : undefined
  const source = hd ?? artwork

  if (!source) {
    return (
      <View style={[styles.viewportCoverBox, { backgroundColor: colors.coverPlaceholder }]}>
        <BrandMark width={120} color={colors.coverPlaceholderMark} />
      </View>
    )
  }

  return (
    <View style={styles.viewportCoverBox}>
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={['white', 'white', 'rgba(255,255,255,0.7)', 'transparent']}
            locations={[0, 0.52, 0.80, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <Image
          source={{ uri: source.url, headers: source.headers }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      </MaskedView>
    </View>
  )
}

/**
 * 沉浸式暗化渐变遮罩：
 * - 顶部轻防眩：保证导航栏拖动条在浅色封面上可见；
 * - 下半部暗化渐变遮罩：从透明过渡到底部深黑，
 *   让透出来的底层模糊光影在控件区域变暗，承托歌名、进度条与播放按钮的高对比度可读性。
 */
export function ImmersiveDarkOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 顶部轻防眩 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
        locations={[0, 0.18]}
        style={StyleSheet.absoluteFill}
      />
      {/* 下半部暗化遮罩 */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.46)', 'rgba(0,0,0,0.90)']}
        locations={[0.42, 0.68, 0.96]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

/** 兼容原有 ImmersiveCover 调用的别名 */
export const ImmersiveCover = ImmersiveDarkOverlay

const styles = StyleSheet.create({
  viewportCoverBox: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
})


