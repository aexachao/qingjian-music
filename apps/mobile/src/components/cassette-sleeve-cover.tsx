import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { CoverImage } from './cover-image'

export interface CassetteSleeveCoverProps {
  coverId?: string | null
  /** 整体宽度（默认 254，对应 375 画布下 254x170 基准） */
  width?: number
  /** 兼容尺寸属性，若传入则作为整体宽度 */
  size?: number
  /** 外层容器自定义样式 */
  style?: StyleProp<ViewStyle>
}

const CASSETTE_SLEEVE_IMAGE = require('../../assets/images/cassette-sleeve-case.png')

/**
 * 拟物化复古卡带盒（Cassette Mixtape）封套设计基准（基于 2x 图 508x340，1x 画布 254x170）：
 * - 外层盒体：254pt 宽 × 170pt 高
 * - 内部歌单封面视窗：宽 117pt × 高 123pt
 * - 视窗定位：距离外盒左侧 67.5pt，顶部 20pt
 * - 歌单封面圆角：1pt（匹配透明外壳内嵌硬边矩形卡槽）
 */
const BASE_WIDTH = 254
const BASE_HEIGHT = 170
const BASE_COVER_LEFT = 67.5
const BASE_COVER_TOP = 20
const BASE_COVER_WIDTH = 117
const BASE_COVER_HEIGHT = 123

export function CassetteSleeveCover({ coverId, width, size, style }: CassetteSleeveCoverProps) {
  const targetWidth = width ?? (size ? Math.round(size * (BASE_WIDTH / BASE_COVER_WIDTH)) : BASE_WIDTH)
  const scale = targetWidth / BASE_WIDTH
  const height = Math.round(BASE_HEIGHT * scale)
  const coverLeft = Math.round(BASE_COVER_LEFT * scale)
  const coverTop = Math.round(BASE_COVER_TOP * scale)
  const coverWidth = Math.round(BASE_COVER_WIDTH * scale)
  const coverHeight = Math.round(BASE_COVER_HEIGHT * scale)
  const coverRadius = Math.max(Math.round(1 * scale), 1)

  return (
    <View style={[styles.root, { width: targetWidth, height }, style]}>
      {/* 1. 真实歌单封面印刷贴纸（底层） */}
      <View
        style={[
          styles.coverWrapper,
          {
            left: coverLeft,
            top: coverTop,
            width: coverWidth,
            height: coverHeight,
            borderRadius: coverRadius,
          },
        ]}
      >
        <CoverImage
          coverId={coverId ?? undefined}
          size={coverHeight}
          borderRadius={0}
        />
      </View>

      {/* 2. 高精透光亚克力复古卡带外壳（顶层透明光泽与机械齿轮遮罩） */}
      <Image
        source={CASSETTE_SLEEVE_IMAGE}
        style={[styles.sleeveOverlay, { width: targetWidth, height }]}
        resizeMode="contain"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    alignSelf: 'center',
  },
  coverWrapper: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleeveOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },
})
