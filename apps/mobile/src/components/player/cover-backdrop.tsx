import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/**
 * 播放页背景：把当前封面放大模糊铺满，再压一层从透明到页面底色的渐变。
 *
 * 没有用「取主色画渐变」那条路——那要额外的原生取色库，
 * 而模糊封面本身就是封面的颜色，Apple Music 的正在播放页也是这么做的，
 * 换歌时颜色跟着封面走，成本只有一张已经缓存过的图。
 */
export function CoverBackdrop({ artwork }: { artwork?: HttpResource | undefined }) {
  const colors = useThemeColors()
  const styles = useStyles()
  if (!artwork) return <View style={styles.fallback} />

  return (
    <View style={styles.container} pointerEvents="none">
      <Image
        source={{ uri: artwork.url, headers: artwork.headers }}
        style={styles.image}
        blurRadius={50}
        contentFit="cover"
        // 换歌时颜色淡入，别硬切
        transition={200}
        cachePolicy="memory-disk"
      />
      {/* 上下压深：顶部导航和底部工具栏那两块要保证文字对比度 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', colors.bgPrimary]}
        locations={[0, 0.45, 1]}
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
  // 放大一点，模糊后的边缘不会露出底色
  image: { position: 'absolute', top: '-10%', left: '-10%', width: '120%', height: '120%', opacity: 0.75 },
  scrim: { ...fill },
}))
