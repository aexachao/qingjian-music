import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { CoverImage } from './cover-image'

export interface CDSleeveCoverProps {
  coverId?: string | null
  coverUrl?: string
  /** 整体宽度（默认 260，对应 375 画布下 260x240 基准） */
  width?: number
  /** 兼容尺寸属性，若传入则作为整体宽度 */
  size?: number
  /** 外层容器自定义样式 */
  style?: StyleProp<ViewStyle>
  /** 显式指定主题模式，若不传则跟随当前 App 主题 */
  theme?: 'dark' | 'light'
}

const VINYL_SLEEVE_DARK = require('../../assets/images/vinyl-sleeve-case-dark.png')
const VINYL_SLEEVE_LIGHT = require('../../assets/images/vinyl-sleeve-case-light.png')

/**
 * 拟物化黑胶唱片封套设计基准（紧凑外接矩形 463x428，方形封面视窗 400x400）：
 * - 外层盒体及探出黑胶盘：463pt 宽 × 428pt 高
 * - 内部专辑封面视窗：宽 400pt × 高 400pt
 * - 视窗定位：距离外盒左侧 0pt，顶部 6pt
 * - 专辑封面圆角：基准 8pt
 */
const BASE_WIDTH = 463
const BASE_HEIGHT = 428
const BASE_COVER_LEFT = 0
const BASE_COVER_TOP = 6
const BASE_COVER_WIDTH = 400
const BASE_COVER_HEIGHT = 400
const BASE_COVER_RADIUS = 8

export function CDSleeveCover({ coverId, coverUrl, width, size, style, theme }: CDSleeveCoverProps) {
  const { mode } = useAppTheme()
  const resolvedMode = theme ?? mode
  const sleeveImage = resolvedMode === 'light' ? VINYL_SLEEVE_LIGHT : VINYL_SLEEVE_DARK

  const targetWidth = width ?? (size ? Math.round(size * (BASE_WIDTH / BASE_COVER_WIDTH)) : 260)
  const scale = targetWidth / BASE_WIDTH
  const height = Math.round(BASE_HEIGHT * scale)
  const coverLeft = Math.round(BASE_COVER_LEFT * scale)
  const coverTop = Math.round(BASE_COVER_TOP * scale)
  const coverWidth = Math.round(BASE_COVER_WIDTH * scale)
  const coverHeight = Math.round(BASE_COVER_HEIGHT * scale)
  const coverRadius = Math.max(Math.round(BASE_COVER_RADIUS * scale), 2)

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
          resource={coverUrl ? { url: coverUrl, headers: {} } : undefined}
          size={coverWidth}
          borderRadius={coverRadius}
        />
      </View>

      {/* 2. 顶层黑胶唱片封套开口、半透磨砂/卡纸保护套、唱片探出体与立体阴影 */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          source={sleeveImage}
          style={{ width: targetWidth, height }}
          resizeMode="contain"
        />
      </View>
    </View>
  )
}

/** 兼容别名导出 */
export const VinylSleeveCover = CDSleeveCover

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
