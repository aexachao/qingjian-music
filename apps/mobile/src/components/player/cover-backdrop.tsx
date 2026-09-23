import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { createThemedStyles } from '@/theme/theme-provider'

/**
 * 播放页背景：把当前封面放大模糊铺满，再压一层从透明到页面底色的渐变。
 *
 * 没有用「取主色画渐变」那条路——那要额外的原生取色库，
 * 而模糊封面本身就是封面的颜色，Apple Music 的正在播放页也是这么做的，
 * 换歌时颜色跟着封面走，成本只有一张已经缓存过的图。
 */
export function CoverBackdrop({ artwork }: { artwork?: HttpResource | undefined }) {
  const styles = useStyles()
  if (!artwork) return <View style={styles.fallback} />

  return (
    <View style={styles.container} pointerEvents="none">
      <Image
        source={{ uri: artwork.url, headers: artwork.headers }}
        style={styles.image}
        blurRadius={65}
        contentFit="cover"
        // 换歌时颜色淡入，别硬切
        transition={220}
        cachePolicy="memory-disk"
      />
      {/* 柔和环境光影渐变：顶部轻微防眩，中间保留原图色彩，底部柔和过渡承托 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.20)', 'rgba(0,0,0,0.65)']}
        locations={[0, 0.20, 0.60, 1]}
        style={styles.scrim}
      />
    </View>
  )
}

/** RN 0.86 的类型里没有 absoluteFillObject，自己写一份 */
const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const

const useStyles = createThemedStyles((colors) => ({
  container: { ...fill, backgroundColor: colors.bgPrimary },
  fallback: { ...fill, backgroundColor: colors.bgPrimary },
  // 放大充满全屏，提供饱满的四周漫反射光影，不露任何黑边
  image: { position: 'absolute', top: '-15%', left: '-15%', width: '130%', height: '130%', opacity: 1 },
  scrim: { ...fill },
}))
