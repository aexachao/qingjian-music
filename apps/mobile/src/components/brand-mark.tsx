import Svg, { Rect } from 'react-native-svg'

/**
 * 品牌记号：默认应用图标「绯红声谱」里的那 **15 根竖条**（两组、高低错落、圆头）。
 *
 * ── 为什么是画出来的，不是贴图 ──────────────────────────────────────────────
 * ① 「只取 logo 的部分，不取背景色」—— 图里那层品牌红底是图标的一部分，封面占位不需要它；
 * ② 矢量在任何尺寸都清晰，也不占包体；
 * ③ 颜色从 token 来（`colors.brandTint`），换品牌色时占位图跟着走。
 *
 * 几何是从 `assets/images/logos/logo-crimson-bars.png` 里逐列量出来的（阈值：不透明且近白），
 * 坐标系就是那 15 根竖条的包围盒（567×634），所以 `viewBox` 用原图单位。
 * ⚠️ 这个记号**固定取默认图标**的样式，**不跟随设置里切换的启动图标** —— 封面占位属于
 * 组件语言的一部分，不该随用户的图标选择变形。
 */
const VIEW_BOX_WIDTH = 567
const VIEW_BOX_HEIGHT = 634

/** [x, y, 宽, 高]（原图单位；圆头 = 宽的一半做圆角） */
const BARS: readonly (readonly [number, number, number, number])[] = [
  [0, 429, 19, 78],
  [37, 384, 19, 168],
  [77, 345, 19, 244],
  [116, 315, 19, 300],
  [156, 297, 19, 337],
  [196, 310, 19, 304],
  [235, 334, 19, 255],
  [274, 377, 19, 166],
  [309, 90, 19, 383],
  [349, 41, 19, 207],
  [389, 0, 19, 282],
  [428, 40, 20, 272],
  [469, 82, 19, 262],
  [508, 124, 20, 252],
  [548, 171, 19, 205],
]

export const BRAND_MARK_ASPECT = VIEW_BOX_WIDTH / VIEW_BOX_HEIGHT

export interface BrandMarkProps {
  /** 记号宽度（高度按比例算） */
  width: number
  color: string
}

export function BrandMark({ width, color }: BrandMarkProps) {
  const height = width / BRAND_MARK_ASPECT
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}>
      {BARS.map(([x, y, w, h]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={w / 2} fill={color} />
      ))}
    </Svg>
  )
}
