import MaskedView from '@react-native-masked-view/masked-view'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { BrandMark } from '@/components/brand-mark'
import { useThemeColors } from '@/theme/theme-provider'
import { useServerSession } from '@/lib/server-session'

/** 全屏封面的高清尺寸：飞牛 size>=~1000 直接返回原图（实测），足够 3x 屏铺满不糊 */
const IMMERSIVE_COVER_SIZE = 1200

/**
 * 沉浸式全屏封面（cover 态专用，方案 A）。
 *
 * 层次（从下到上）：
 *   1. 封面高清原图，`contentFit="cover"` 铺满整屏（主体清晰）；
 *   2. 渐进式高斯模糊层（Progressive Blur）：利用 MaskedView + LinearGradient 遮罩，
 *      让模糊图（blurRadius=45）从中下部（~44%）平滑淡入到完全不透明（~72%），
 *      将下半部的建筑物与倒影等高频线条彻底融化为光影；
 *   3. 底部黑色线性渐变遮罩（Dark Gradient Overlay，从透明过渡到底部深黑），
 *      为前景的白色歌名、进度条、播放控制按键提供极高对比度的暗色舞台；
 *   4. 顶部轻压暗（0~20%），保证状态栏与拖动条可读。
 */
export function ImmersiveCover({ artwork, coverId }: { artwork?: HttpResource | undefined; coverId?: string | undefined }) {
  const colors = useThemeColors()
  const { provider } = useServerSession()
  // 优先用 coverId 现算高清大图（全屏铺满不糊）；拿不到就回退到传入的（队列 600px）
  const hd = coverId && provider ? provider.image(coverId, IMMERSIVE_COVER_SIZE) : undefined
  const source = hd ?? artwork

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {source ? (
        <>
          {/* 1. 底层：封面高清原图铺满，顶部与主体保持清晰 */}
          <Image
            source={{ uri: source.url, headers: source.headers }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />

          {/* 2. 中层：渐进式高斯模糊（Progressive Blur） */}
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,1)']}
                locations={[0, 0.44, 0.72]}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <Image
              source={{ uri: source.url, headers: source.headers }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={45}
              transition={220}
              cachePolicy="memory-disk"
              accessibilityIgnoresInvertColors
            />
          </MaskedView>
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.coverPlaceholder, alignItems: 'center', justifyContent: 'center' }]}>
          <BrandMark width={120} color={colors.coverPlaceholderMark} />
        </View>
      )}

      {/* 3. 顶部轻压暗：保证导航栏（拖动条/返回）在亮色封面上清晰可见 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
        locations={[0, 0.20]}
        style={StyleSheet.absoluteFill}
      />

      {/* 4. 下半部渐进暗化遮罩（Dark Gradient Overlay）：让模糊图层自然融化为深色光影背景 */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.48)', 'rgba(0,0,0,0.88)']}
        locations={[0.44, 0.70, 0.96]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

