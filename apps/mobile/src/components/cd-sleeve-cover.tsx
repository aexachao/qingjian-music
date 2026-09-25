import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { CoverImage } from './cover-image'

export interface CDSleeveCoverProps {
  coverId?: string | null
  /** 整体宽度（默认 254，对应 375 画布下 254x170 基准） */
  width?: number
  /** 兼容尺寸属性，若传入则作为整体宽度 */
  size?: number
  /** 外层容器自定义样式 */
  style?: StyleProp<ViewStyle>
}

const CD_SLEEVE_IMAGE = require('../../assets/images/cd-sleeve-case.png')

/**
 * 拟物化 CD 封套设计基准（已物理裁除透明边缘，紧凑外接矩形 2x 404x270，1x 基准 202x135）：
 * - 外层盒体：202pt 宽 × 135pt 高
 * - 内部专辑封面视窗：宽 125pt × 高 123pt
 * - 视窗定位：距离外盒左侧 20pt，顶部 6pt
 * - 专辑封面圆角：用户指定 3pt
 */
const BASE_WIDTH = 202
const BASE_HEIGHT = 135
const BASE_COVER_LEFT = 20
const BASE_COVER_TOP = 6
const BASE_COVER_WIDTH = 125
const BASE_COVER_HEIGHT = 123

export function CDSleeveCover({ coverId, width, size, style }: CDSleeveCoverProps) {
  const targetWidth = width ?? (size ? Math.round(size * (BASE_WIDTH / BASE_COVER_WIDTH)) : BASE_WIDTH)
  const scale = targetWidth / BASE_WIDTH
  const height = Math.round(BASE_HEIGHT * scale)
  const coverLeft = Math.round(BASE_COVER_LEFT * scale)
  const coverTop = Math.round(BASE_COVER_TOP * scale)
  const coverWidth = Math.round(BASE_COVER_WIDTH * scale)
  const coverHeight = Math.round(BASE_COVER_HEIGHT * scale)
  const coverRadius = Math.max(Math.round(3 * scale), 2)

  return (
    <View style={[styles.root, { width: targetWidth, height }, style]}>
      {/* 1. 真实专辑封面印刷封套（底层） */}
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
          size={coverWidth}
          borderRadius={coverRadius}
        />
      </View>

      {/* 2. 顶层高透 PVC 保护套 + 右侧探出的全息彩虹 CD 盘体 */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          source={CD_SLEEVE_IMAGE}
          style={{ width: targetWidth, height }}
          resizeMode="contain"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverWrapper: {
    position: 'absolute',
    overflow: 'hidden',
  },
})
