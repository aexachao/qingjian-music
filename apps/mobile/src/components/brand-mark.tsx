import Svg, { Path } from 'react-native-svg'

/**
 * 品牌记号：轻简音乐官方应用图标的灵动音符矢量主体。
 *
 * ── 为什么是画出来的，不是贴图 ──────────────────────────────────────────────
 * ① 「只取 logo 的音符主体，不取背景色」—— 渐变红底是图标的一部分，封面占位与水印不需要它；
 * ② 矢量在任何尺寸都极度清晰，零光栅锯齿，不占额外包体；
 * ③ 颜色从 token 来（`colors.brandTint` / `colors.coverPlaceholderMark`），随主题与品牌色动态着色。
 *
 * 坐标系对应原 1024×1024 画布中音符的包围盒（437×651），viewBox 精确裁切。
 * ⚠️ 这个记号固定取官方音符样式，不跟随设置里切换的启动图标 —— 封面占位属于组件语言的一部分。
 */
export const VIEW_BOX_MIN_X = 322
export const VIEW_BOX_MIN_Y = 174
export const VIEW_BOX_WIDTH = 382
export const VIEW_BOX_HEIGHT = 676

export const BRAND_MARK_ASPECT = VIEW_BOX_WIDTH / VIEW_BOX_HEIGHT

export const BRAND_NOTE_PATH =
  'M322,710.07C322,794.83,389.60,849.07,473,849.07C556.39,849.07,624,786.83,624,710.07C624,685.07,622.04,670.64,620,660Q610,607.93,549.55,340.17C547.57,331.75,552.63,323.29,560.98,321.05L632.71,301.19C673.81,289.82,702.47,252.70,703.09,210.07L703.34,192.64C705.22,181.41,695.08,171.87,683.98,174.42L482.29,220.75C447.88,228.66,426.37,262.95,434.23,297.38L497.14,572.85C489.16,571.66,481.09,571.07,473,571.07C389.60,571.07,322,625.30,322,710.07Z'

export interface BrandMarkProps {
  /** 记号宽度（高度按比例算） */
  width: number
  color: string
}

export function BrandMark({ width, color }: BrandMarkProps) {
  const height = width / BRAND_MARK_ASPECT
  return (
    <Svg width={width} height={height} viewBox={`${VIEW_BOX_MIN_X} ${VIEW_BOX_MIN_Y} ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}>
      <Path d={BRAND_NOTE_PATH} fill={color} />
    </Svg>
  )
}
