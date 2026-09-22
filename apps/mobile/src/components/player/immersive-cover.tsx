import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { BrandMark } from '@/components/brand-mark'
import { useThemeColors } from '@/theme/theme-provider'

/**
 * 沉浸式全屏封面（cover 态专用，方案 A）。
 *
 * 层次（从下到上）：
 *   1. 封面原图，`contentFit="cover"` 铺满整屏（会裁剪，只显示中间，对齐 Apple Music）；
 *   2. 底部黑色线性渐变遮罩（透明 → 深黑）——让下半部图片「融化」成深色，
 *      给歌名/进度/控制腾出高对比度的暗背景。
 *
 * 没有真·渐进高斯模糊（expo-blur 只能均匀模糊）；暗化渐变已经贡献主要的沉浸观感。
 * 铺满整屏（含安全区/灵动岛后面），前景控件自己避让安全区。
 */
export function ImmersiveCover({ artwork }: { artwork?: HttpResource | undefined }) {
  const colors = useThemeColors()

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {artwork ? (
        <Image
          source={{ uri: artwork.url, headers: artwork.headers }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.coverPlaceholder, alignItems: 'center', justifyContent: 'center' }]}>
          <BrandMark width={120} color={colors.coverPlaceholderMark} />
        </View>
      )}

      {/* 顶部轻压暗：保证导航栏（拖动条/返回）在亮封面上也可见 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
        locations={[0, 0.22]}
        style={StyleSheet.absoluteFill}
      />
      {/* 下半部渐进暗化：从中部透明过渡到底部深黑，控件压在这上面 */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        locations={[0.42, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}
