import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CoverImage } from './cover-image'
import { useThemeColors } from '@/theme/theme-provider'

export interface VinylDiscProps {
  /** 流派 ID，用于选择中心点颜色 */
  genreId: string
  /** 中心显示的专辑封面 ID（仅 detail 模式生效） */
  coverId?: string | null
  /** 碟片尺寸（完整圆盘直径） */
  size: number
  /** 形态：'card'（卡片专用） | 'detail'（详情页顶部拱形） | 'full'（完整圆盘） */
  variant?: 'card' | 'detail' | 'full'
}

const VINYL_BASE = require('../../assets/genre-vinyl/vinyl-base.png')
const CENTER_VARIANTS: ImageSourcePropType[] = [
  require('../../assets/genre-vinyl/center-red.png'),
  require('../../assets/genre-vinyl/center-orange.png'),
  require('../../assets/genre-vinyl/center-blue.png'),
  require('../../assets/genre-vinyl/center-purple.png'),
]

export function getCenterVariant(genreId: string): ImageSourcePropType {
  // genreId 理论上必填，但真机上路由参数或实体缺 id 时会是 undefined，
  // 直接 .split 会崩，这里兜底成空串（仍返回一个稳定的默认变体）。
  const hash = (genreId ?? '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return CENTER_VARIANTS[hash % CENTER_VARIANTS.length]
}

export function VinylDisc({ genreId, coverId, size, variant = 'full' }: VinylDiscProps) {
  const colors = useThemeColors()
  const centerSize = size * 0.44
  const coverSize = centerSize * 0.88

  if (variant === 'detail') {
    const containerHeight = Math.round(size * 0.58)
    const fadeHeight = Math.round(size * 0.22)

    return (
      <View style={[styles.detailContainer, { width: size, height: containerHeight }]}>
        <View style={[styles.disc, { width: size, height: size }]}>
          <Image source={VINYL_BASE} style={{ width: size, height: size }} resizeMode="contain" />

          <View style={[styles.center, { width: centerSize, height: centerSize }]}>
            {coverId ? (
              <CoverImage
                coverId={coverId}
                size={coverSize}
                borderRadius={coverSize / 2}
              />
            ) : (
              <Image
                source={getCenterVariant(genreId)}
                style={{ width: centerSize, height: centerSize }}
                resizeMode="contain"
              />
            )}
          </View>
        </View>

        <LinearGradient
          colors={['transparent', colors.bgPrimary]}
          locations={[0, 1]}
          style={[styles.gradientFade, { height: fadeHeight }]}
          pointerEvents="none"
        />
      </View>
    )
  }

  // card or full variant
  return (
    <View style={[styles.disc, { width: size, height: size }]}>
      <Image source={VINYL_BASE} style={{ width: size, height: size }} resizeMode="contain" />

      <View style={[styles.center, { width: centerSize, height: centerSize }]}>
        {coverId ? (
          <CoverImage
            coverId={coverId}
            size={coverSize}
            borderRadius={coverSize / 2}
          />
        ) : (
          <Image
            source={getCenterVariant(genreId)}
            style={{ width: centerSize, height: centerSize }}
            resizeMode="contain"
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  detailContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    position: 'relative',
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
})
